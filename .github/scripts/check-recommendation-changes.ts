import { appendFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  collectPackageSignals,
  evaluateRecommendation,
  extractCuratedCategories,
  maxRecommendationsPerCategory,
} from './recommendation-quality.ts'
import { catalogSchema } from '@bundlephobia/service-contracts/recommendations'

const fixturePath = 'utils/similar-packages.catalog.json'

const baseSha = process.argv[2]

if (!baseSha) {
  throw new Error('Pass the pull request base SHA as the first argument.')
}

const currentSource = await readFile(
  new URL(`../../${fixturePath}`, import.meta.url),
  'utf8',
)

let baseSource

try {
  baseSource = execFileSync('git', ['show', `${baseSha}:${fixturePath}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch {
  // The migration PR's base still has the same catalog embedded in TypeScript.
  baseSource = null
}

function parseCatalog(source: string) {
  return new Map(
    Object.entries(catalogSchema.parse(JSON.parse(source))).map(
      ([slug, category]) => [
        slug,
        { slug, name: category.name, packages: new Set(category.similar) },
      ],
    ),
  )
}

const current = parseCatalog(currentSource)

const base = baseSource
  ? parseCatalog(baseSource)
  : extractCuratedCategories(
      execFileSync('git', ['show', `${baseSha}:utils/similarPackages.ts`], {
        encoding: 'utf8',
      }),
    )

const additions = [...current.values()]
  .flatMap(category => {
    const categoryAdditions = []

    for (const packageName of category.packages) {
      if (!base.get(category.slug)?.packages.has(packageName)) {
        categoryAdditions.push({ category, packageName })
      }
    }

    return categoryAdditions
  })
  .sort((left, right) =>
    `${left.category.slug}/${left.packageName}`.localeCompare(
      `${right.category.slug}/${right.packageName}`,
    ),
  )

const results = []

for (const { category, packageName } of additions) {
  const signals = await collectPackageSignals(packageName, {
    includeBundleSize: false,
  })

  const { errors, notes } = evaluateRecommendation(signals)

  if (category.packages.size > maxRecommendationsPerCategory) {
    errors.push(
      `${category.name} would contain ${category.packages.size} recommendations; the maximum is ${maxRecommendationsPerCategory}. Remove a weaker recommendation in the same pull request.`,
    )
  }

  results.push({
    category,
    packageName,
    signals,
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
    '| Category | Package | Downloads/week | GitHub stars | Result |',
    '| --- | --- | ---: | ---: | --- |',
  )

  for (const {
    category,
    packageName,
    signals,
    errors,
    requiresReview,
  } of results) {
    lines.push(
      `| ${category.name} (${
        category.packages.size
      }/${maxRecommendationsPerCategory}) | ${packageName} | ${signals.weeklyDownloads ?? 'unknown'} | ${
        signals.githubStars ?? 'unknown'
      } | ${
        errors.length
          ? 'blocked'
          : requiresReview
            ? 'maintainer review'
            : 'ready'
      } |`,
    )
  }

  lines.push(
    '',
    '_Missing/deprecated npm packages and exceeding the category cap block. Popularity and maintenance are advisory; this check never triggers production package builds._',
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
