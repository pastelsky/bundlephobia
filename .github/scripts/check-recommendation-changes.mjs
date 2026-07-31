import { appendFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  collectPackageSignals,
  evaluateRecommendation,
  extractCuratedRecommendations,
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
const current = extractCuratedRecommendations(currentSource)
const base = extractCuratedRecommendations(baseSource)
const additions = [...current]
  .filter(packageName => !base.has(packageName))
  .sort()
const results = []

for (const packageName of additions) {
  const signals = await collectPackageSignals(packageName)
  const evaluation = evaluateRecommendation(signals)
  results.push({ packageName, signals, evaluation })
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
    '| Package | npm | Downloads/week | GitHub stars | Maintenance | Result |',
    '| --- | --- | ---: | ---: | --- | --- |'
  )

  for (const { packageName, signals, evaluation } of results) {
    lines.push(
      `| ${packageName} | ${
        signals.exists && !signals.deprecated ? 'pass' : 'fail'
      } | ${signals.weeklyDownloads ?? 'unknown'} | ${
        signals.githubStars ?? 'unknown'
      } | ${signals.maintenancePass ? 'pass' : 'needs evidence'} | ${
        evaluation.status
      } |`
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

const failures = results.filter(
  ({ evaluation }) =>
    evaluation.blockers.length > 0 || evaluation.needsEvidence.length > 0
)

if (failures.length) {
  for (const { packageName, evaluation } of failures) {
    console.error(`\n${packageName}:`)
    for (const finding of [
      ...evaluation.blockers,
      ...evaluation.needsEvidence,
    ]) {
      console.error(`- ${finding}`)
    }
  }
  process.exitCode = 1
}
