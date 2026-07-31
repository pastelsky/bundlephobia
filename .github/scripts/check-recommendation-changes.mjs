import { appendFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  collectBundleSize,
  collectPackageSignals,
  evaluateRecommendation,
  evaluateSizeAdvantage,
  extractCuratedCategories,
  qualityThresholds,
} from './recommendation-quality.mjs'

const fixturePath = 'server/middlewares/similar-packages/fixtures.ts'
const baseSha = process.argv[2]

if (!baseSha) {
  throw new Error('Pass the pull request base SHA as the first argument.')
}

const currentSource = await readFile(fixturePath, 'utf8')
const baseSource = execFileSync('git', ['show', `${baseSha}:${fixturePath}`], {
  encoding: 'utf8',
})
const current = extractCuratedCategories(currentSource)
const base = extractCuratedCategories(baseSource)
const additions = [...current.values()]
  .flatMap(category =>
    [...category.packages]
      .filter(
        packageName => !base.get(category.slug)?.packages.has(packageName)
      )
      .map(packageName => ({ category, packageName }))
  )
  .sort((left, right) =>
    `${left.category.slug}/${left.packageName}`.localeCompare(
      `${right.category.slug}/${right.packageName}`
    )
  )
const results = []

for (const { category, packageName } of additions) {
  const signals = await collectPackageSignals(packageName)
  const evaluation = evaluateRecommendation(signals)
  const previousPackages = [
    ...(base.get(category.slug)?.packages ?? new Set()),
  ].filter(previousPackage => previousPackage !== packageName)
  const comparisonSizes = await Promise.all(
    previousPackages.map(async previousPackage => ({
      packageName: previousPackage,
      bundleSize: await collectBundleSize(previousPackage),
    }))
  )
  const sizeEvaluation = previousPackages.length
    ? evaluateSizeAdvantage(signals, comparisonSizes)
    : {
        pass: null,
        findings: [],
        smallerThan: [],
        availableAlternatives: [],
      }
  const findings = [
    ...evaluation.blockers,
    ...evaluation.needsEvidence,
    ...sizeEvaluation.findings,
  ]

  if (
    category.packages.size > qualityThresholds.maxRecommendationsPerCategory
  ) {
    findings.push(
      `${category.name} would contain ${category.packages.size} recommendations; the maximum is ${qualityThresholds.maxRecommendationsPerCategory}. Remove a weaker recommendation in the same pull request.`
    )
  }

  results.push({
    category,
    packageName,
    signals,
    evaluation,
    sizeEvaluation,
    findings,
  })
}

const lines = [
  '## Package recommendation quality',
  '',
  additions.length
    ? `Checked ${additions.length} newly curated package(s).`
    : 'No newly curated packages were found in this pull request.',
  '',
]

if (additions.length) {
  lines.push(
    '| Category | Package | Gzip | Downloads/week | GitHub stars | Size advantage | Result |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |'
  )

  for (const {
    category,
    packageName,
    signals,
    evaluation,
    sizeEvaluation,
    findings,
  } of results) {
    lines.push(
      `| ${category.name} (${category.packages.size}/${
        qualityThresholds.maxRecommendationsPerCategory
      }) | ${packageName} | ${signals.bundleSize?.gzip ?? 'unknown'} | ${
        signals.weeklyDownloads ?? 'unknown'
      } | ${signals.githubStars ?? 'unknown'} | ${
        sizeEvaluation.pass === null
          ? 'new category: agent review'
          : sizeEvaluation.pass
          ? `smaller than ${sizeEvaluation.smallerThan.length}`
          : 'fail'
      } | ${findings.length ? 'needs changes' : evaluation.status} |`
    )
  }

  lines.push(
    '',
    '_The build enforces npm existence, non-deprecation, popularity, and maintenance/stability signals. Maintainers still review functional equivalence and relative value._'
  )
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
} else {
  console.log(lines.join('\n'))
}

const failures = results.filter(({ findings }) => findings.length > 0)

if (failures.length) {
  for (const { category, packageName, findings } of failures) {
    console.error(`\n${packageName} in ${category.name}:`)
    for (const finding of findings) {
      console.error(`- ${finding}`)
    }
  }
  process.exitCode = 1
}
