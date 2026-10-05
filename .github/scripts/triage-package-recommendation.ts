import { readFile } from 'node:fs/promises'
import { catalogSchema } from '@bundlephobia/service-contracts/recommendations'
import { z } from 'zod'
import { request } from '@octokit/request'

import {
  collectBundleSize,
  collectPackageSignals,
  evaluateRecommendation,
  evaluateSizeAdvantage,
  extractIssueFormAnswers,
  isPlausiblePackageName,
  normalizePackageName,
  parsePackageNames,
} from './recommendation-quality.ts'

const REPORT_MARKER = '<!-- bundlephobia-recommendation-quality -->'

const env = z
  .object({
    GITHUB_EVENT_PATH: z.string(),
    GITHUB_REPOSITORY: z.string(),
    GITHUB_TOKEN: z.string(),
  })
  .parse(process.env)

const event = z
  .object({
    issue: z.object({ number: z.number(), body: z.string().nullable() }),
  })
  .parse(JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')))

const [owner, repository] = env.GITHUB_REPOSITORY.split('/')

const issue = event.issue

const token = env.GITHUB_TOKEN

const githubRequest = request.defaults({
  headers: { authorization: `Bearer ${token}` },
  request: { redirect: 'error' },
})

async function github(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: string } = {},
  // Raw GitHub JSON is validated with the endpoint schema by each caller.
  // oxlint-disable-next-line anti-slop/no-unknown-returns
): Promise<unknown> {
  const response = await githubRequest({
    method: options.method ?? 'GET',
    url: path,
    data: options.body ? JSON.parse(options.body) : undefined,
    request: { signal: AbortSignal.timeout(30000) },
  })

  return response.status === 204 ? null : response.data
}

function display(
  value: string | number | null | undefined,
  fallback = 'Unavailable',
) {
  return value === null || value === undefined || value === ''
    ? fallback
    : value
}

function icon(value: boolean) {
  return value ? '✅' : '⚠️'
}

async function findOpenDuplicates(packageName: string) {
  const query = encodeURIComponent(
    `repo:${owner}/${repository} is:issue is:open label:"similar suggestion" in:title "${packageName}"`,
  )

  const result = z
    .object({
      items: z.array(z.object({ number: z.number(), html_url: z.string() })),
    })
    .parse(await github(`/search/issues?q=${query}&per_page=10`))

  return result.items.filter(candidate => candidate.number !== issue.number)
}

async function upsertReport(body: string) {
  const comments = z
    .array(z.object({ id: z.number(), body: z.string().nullable().optional() }))
    .parse(
      await github(
        `/repos/${owner}/${repository}/issues/${issue.number}/comments?per_page=100`,
      ),
    )

  const previous = comments.find(comment =>
    comment.body?.includes(REPORT_MARKER),
  )

  if (previous) {
    await github(
      `/repos/${owner}/${repository}/issues/comments/${previous.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      },
    )

    return
  }

  await github(
    `/repos/${owner}/${repository}/issues/${issue.number}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    },
  )
}

const answers = extractIssueFormAnswers(issue.body ?? '')

const packageName = normalizePackageName(answers.packageName)

const comparisonNames = parsePackageNames(answers.alternative)

if (!isPlausiblePackageName(packageName)) {
  await upsertReport(`${REPORT_MARKER}
## Automated recommendation check

**Status: invalid package name**

Enter the exact npm package name in the **npm package name** field (for example, \`date-fns\` or \`@tanstack/query-core\`). The report will run again when the issue is edited.

_This automation checks objective signals only. Maintainers decide functional equivalence and recommendation quality._`)
  process.exit(0)
}

const [signals, duplicates, catalogSource, comparisonSizes] = await Promise.all(
  [
    collectPackageSignals(packageName, { githubToken: token }),
    findOpenDuplicates(packageName),
    readFile(
      new URL('../../utils/similar-packages.catalog.json', import.meta.url),
      'utf8',
    ),
    Promise.all(
      comparisonNames
        .filter(isPlausiblePackageName)
        .map(async comparisonName => ({
          packageName: comparisonName,
          bundleSize: await collectBundleSize(comparisonName),
        })),
    ),
  ],
)

const alreadyCurated = Object.values(
  catalogSchema.parse(JSON.parse(catalogSource)),
).some(category => category.similar.includes(packageName))

const evaluation = evaluateRecommendation(signals, answers)

const sizeEvaluation = evaluateSizeAdvantage(signals, comparisonSizes)

for (const comparisonName of comparisonNames) {
  if (!isPlausiblePackageName(comparisonName)) {
    evaluation.notes.push(
      `\`${comparisonName}\` is not a valid exact npm package name.`,
    )
  }
}

if (!sizeEvaluation.available) {
  evaluation.notes.push('Bundle size comparison was unavailable.')
} else if (!sizeEvaluation.smallerThan.length) {
  evaluation.notes.push(
    'The default entry point is not smaller than the measured alternatives.',
  )
}

if (alreadyCurated) {
  evaluation.notes.push(
    'This package is already in the curated recommendations.',
  )
}

if (duplicates.length) {
  evaluation.notes.push(
    `Found ${duplicates.length} other open recommendation issue(s) for this package.`,
  )
}

evaluation.status = evaluation.errors.length
  ? 'invalid'
  : evaluation.notes.length
    ? 'needs review'
    : 'ready for maintainer review'

const findings = [...evaluation.errors, ...evaluation.notes]

const duplicateLinks = duplicates
  .map(candidate => `[#${candidate.number}](${candidate.html_url})`)
  .join(', ')

const candidateSize = signals.bundleSize

const sizeRows = [
  { packageName, bundleSize: signals.bundleSize },
  ...comparisonSizes,
]
  .map(({ packageName: sizePackageName, bundleSize }) => {
    let delta = 'candidate'

    if (
      candidateSize?.available &&
      bundleSize?.available &&
      bundleSize.gzip > 0 &&
      sizePackageName !== packageName
    ) {
      const percentage = Math.round(
        (Math.abs(candidateSize.gzip - bundleSize.gzip) / bundleSize.gzip) *
          100,
      )

      delta = `candidate is ${percentage}% ${candidateSize.gzip < bundleSize.gzip ? 'smaller' : 'larger'}`
    }

    return `| ${sizePackageName} | ${
      bundleSize?.available ? bundleSize.gzip.toLocaleString() : 'Unavailable'
    } | ${delta} |`
  })
  .join('\n')

let npmPackageResult = 'Check unavailable'

if (signals.exists === true) {
  npmPackageResult = `[${packageName}](https://www.npmjs.com/package/${packageName})`
} else if (signals.exists === false) {
  npmPackageResult = 'Not found'
}

const report = `${REPORT_MARKER}
## Automated recommendation check

**Status: ${evaluation.status}**

| Signal | Result |
| --- | --- |
| npm package | ${icon(signals.exists === true)} ${npmPackageResult} |
| Latest version | ${display(signals.latestVersion)}${
  signals.deprecated ? ' — deprecated' : ''
} |
| Weekly npm downloads | ${display(signals.weeklyDownloads?.toLocaleString())} |
| GitHub repository | ${
  signals.repository
    ? `[${signals.repository}](https://github.com/${signals.repository})`
    : 'Not found in npm metadata'
} |
| GitHub stars | ${display(signals.githubStars?.toLocaleString())} |
| Last npm release | ${display(signals.publishedAt)} |
| Last repository push | ${display(signals.repositoryPushedAt)} |
| Already curated | ${alreadyCurated ? 'Yes' : 'No'} |
| Other open suggestions | ${duplicateLinks || 'None found'} |

### Minified + gzip size

| Package | Bytes | Difference |
| --- | ---: | ---: |
${sizeRows}

${
  findings.length
    ? `### Follow-up needed\n\n${findings
        .map(finding => `- ${finding}`)
        .join('\n')}`
    : 'The objective checks passed. A maintainer still needs to verify category fit and whether this improves the recommendations.'
}

_Thresholds: at least 1,000 weekly npm downloads or 100 GitHub stars; maintenance is indicated by activity in the last two years or a stable 1.x-or-newer release. These are triage signals, not automatic acceptance._`

await upsertReport(report)
