import { readFile } from 'node:fs/promises'

import {
  collectBundleSize,
  collectPackageSignals,
  evaluateRecommendation,
  evaluateSizeAdvantage,
  extractCuratedRecommendations,
  extractIssueFormAnswers,
  isPlausiblePackageName,
  normalizePackageName,
  parsePackageNames,
} from './recommendation-quality.mjs'

const REPORT_MARKER = '<!-- bundlephobia-recommendation-quality -->'
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
const [owner, repository] = process.env.GITHUB_REPOSITORY.split('/')
const issue = event.issue
const token = process.env.GITHUB_TOKEN

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'bundlephobia-recommendation-checker',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned HTTP ${response.status}`)
  }

  return response.status === 204 ? null : response.json()
}

function display(value, fallback = 'Unavailable') {
  return value === null || value === undefined || value === ''
    ? fallback
    : value
}

function icon(value) {
  return value ? '✅' : '⚠️'
}

async function findOpenDuplicates(packageName) {
  const query = encodeURIComponent(
    `repo:${owner}/${repository} is:issue is:open label:"similar suggestion" in:title "${packageName}"`
  )
  const result = await github(`/search/issues?q=${query}&per_page=10`)

  return result.items.filter(candidate => candidate.number !== issue.number)
}

async function upsertReport(body) {
  const comments = await github(
    `/repos/${owner}/${repository}/issues/${issue.number}/comments?per_page=100`
  )
  const previous = comments.find(comment =>
    comment.body?.includes(REPORT_MARKER)
  )

  if (previous) {
    await github(
      `/repos/${owner}/${repository}/issues/comments/${previous.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }
    )
    return
  }

  await github(
    `/repos/${owner}/${repository}/issues/${issue.number}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    }
  )
}

const answers = extractIssueFormAnswers(issue.body)
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

const [signals, duplicates, fixtureSource, comparisonSizes] = await Promise.all(
  [
    collectPackageSignals(packageName, { githubToken: token }),
    findOpenDuplicates(packageName),
    readFile('server/middlewares/similar-packages/fixtures.ts', 'utf8'),
    Promise.all(
      comparisonNames
        .filter(isPlausiblePackageName)
        .map(async comparisonName => ({
          packageName: comparisonName,
          bundleSize: await collectBundleSize(comparisonName),
        }))
    ),
  ]
)
const alreadyCurated =
  extractCuratedRecommendations(fixtureSource).has(packageName)
const evaluation = evaluateRecommendation(signals, answers)
const sizeEvaluation = evaluateSizeAdvantage(signals, comparisonSizes)

for (const comparisonName of comparisonNames) {
  if (!isPlausiblePackageName(comparisonName)) {
    evaluation.notes.push(
      `\`${comparisonName}\` is not a valid exact npm package name.`
    )
  }
}
if (!sizeEvaluation.available) {
  evaluation.notes.push('Bundle size comparison was unavailable.')
} else if (!sizeEvaluation.smallerThan.length) {
  evaluation.notes.push(
    'The default entry point is not smaller than the measured alternatives.'
  )
}

if (alreadyCurated) {
  evaluation.notes.push(
    'This package is already in the curated recommendations.'
  )
}
if (duplicates.length) {
  evaluation.notes.push(
    `Found ${duplicates.length} other open recommendation issue(s) for this package.`
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
const sizeRows = [
  { packageName, bundleSize: signals.bundleSize },
  ...comparisonSizes,
]
  .map(({ packageName: sizePackageName, bundleSize }) => {
    const delta =
      signals.bundleSize?.available &&
      bundleSize?.available &&
      sizePackageName !== packageName
        ? (() => {
            const percentage = Math.round(
              (Math.abs(signals.bundleSize.gzip - bundleSize.gzip) /
                bundleSize.gzip) *
                100
            )
            return `candidate is ${percentage}% ${
              signals.bundleSize.gzip < bundleSize.gzip ? 'smaller' : 'larger'
            }`
          })()
        : 'candidate'
    return `| ${sizePackageName} | ${
      bundleSize?.available ? bundleSize.gzip.toLocaleString() : 'Unavailable'
    } | ${delta} |`
  })
  .join('\n')
const report = `${REPORT_MARKER}
## Automated recommendation check

**Status: ${evaluation.status}**

| Signal | Result |
| --- | --- |
| npm package | ${icon(signals.exists === true)} ${
  signals.exists === true
    ? `[${packageName}](https://www.npmjs.com/package/${packageName})`
    : signals.exists === false
    ? 'Not found'
    : 'Check unavailable'
} |
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
