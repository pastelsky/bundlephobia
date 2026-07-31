import { appendFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  collectBundleSize,
  collectPackageSignals,
  evaluateRecommendation,
  evaluateSizeAdvantage,
  extractCuratedCategories,
  maxRecommendationsPerCategory,
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
  const { errors, notes } = evaluateRecommendation(signals)
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
        available: false,
        smallerThan: [],
      }
  if (previousPackages.length && !sizeEvaluation.available) {
    notes.push('Bundle size comparison was unavailable.')
  } else if (sizeEvaluation.available && !sizeEvaluation.smallerThan.length) {
    notes.push(
      'The default entry point is not smaller than the measured category entries.'
    )
  }

  if (category.packages.size > maxRecommendationsPerCategory) {
    errors.push(
      `${category.name} would contain ${category.packages.size} recommendations; the maximum is ${maxRecommendationsPerCategory}. Remove a weaker recommendation in the same pull request.`
    )
  }

  results.push({
    category,
    packageName,
    signals,
    sizeEvaluation,
    errors,
    requiresReview: notes.length > 0,
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
    sizeEvaluation,
    errors,
    requiresReview,
  } of results) {
    lines.push(
      `| ${category.name} (${
        category.packages.size
      }/${maxRecommendationsPerCategory}) | ${packageName} | ${
        signals.bundleSize?.gzip ?? 'unknown'
      } | ${signals.weeklyDownloads ?? 'unknown'} | ${
        signals.githubStars ?? 'unknown'
      } | ${
        !sizeEvaluation.available
          ? 'new category or unavailable'
          : sizeEvaluation.smallerThan.length
          ? `smaller than ${sizeEvaluation.smallerThan.length}`
          : 'not smaller by default'
      } | ${
        errors.length
          ? 'blocked'
          : requiresReview
          ? 'maintainer review'
          : 'ready'
      } |`
    )
  }

  lines.push(
    '',
    '_Only authoritative failures block: a missing/deprecated npm package or exceeding the category cap. Popularity, maintenance, repository, and default-entry size data are advisory._'
  )
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
} else {
  console.log(lines.join('\n'))
}

const failures = results.filter(({ errors }) => errors.length > 0)

if (failures.length) {
  for (const { category, packageName, errors } of failures) {
    console.error(`\n${packageName} in ${category.name}:`)
    for (const error of errors) {
      console.error(`- ${error}`)
    }
  }
  process.exitCode = 1
}
