import { z } from 'zod'
import validatePackageName from 'validate-npm-package-name'
import defaults from './config.json' with { type: 'json' }
import { findRepositories, scanRepositories, rotate } from './search.mjs'

const stateSchema = z
  .object({
    version: z.literal(1),
    cursor: z.number().int().nonnegative(),
    surfaced: z.array(
      z.string().refine(name => validatePackageName(name).validForNewPackages),
    ),
  })
  .strict()

export function readState(value = { version: 1, cursor: 0, surfaced: [] }) {
  return stateSchema.parse(value)
}

export function catalogPackages(catalog) {
  return [
    ...new Set(Object.values(catalog).flatMap(category => category.similar)),
  ].sort()
}

const DAY = 86_400_000

export async function discoverLibraries({
  github,
  catalog,
  pendingCatalog = {},
  excludedPackages = [],
  state: inputState,
  now = new Date(),
  limits = {},
  frameworks = [],
}) {
  const options = { ...defaults, ...limits, frameworks }
  const state = readState(inputState)

  const known = new Set([
    ...catalogPackages(catalog),
    ...catalogPackages(pendingCatalog),
    ...excludedPackages,
    ...state.surfaced,
  ])

  const seeds = rotate(catalogPackages(catalog), state.cursor, options.seeds)

  const date = offset =>
    new Date(now.getTime() - offset * DAY).toISOString().slice(0, 10)

  options.activeSince = date(options.activeDays)
  const notes = []

  const { pools, repositories } = await findRepositories(
    github,
    seeds,
    state.cursor,
    options,
    notes,
  )

  const observations = await scanRepositories(
    github,
    repositories,
    options,
    notes,
  )

  const eligible = rankCandidates(observations, known, options.minimumOwners)
  const candidates = eligible.slice(0, options.candidates)

  const report = {
    observedAt: now.toISOString(),
    source: 'consumer-manifests',
    seeds,
    windows: {
      repositoryActivitySince: options.activeSince,
    },
    limits: options,
    coverage: {
      repositoriesConsidered: new Set(pools.flat().map(repo => repo.repo)).size,
      repositoriesScanned: repositories.length,
      webRepositoriesObserved: new Set(observations.map(item => item.repo))
        .size,
      manifestObservations: observations.length,
      eligiblePackages: eligible.length,
    },
    notes,
    candidates,
    interpretation:
      'Sampled manifest declarations ranked by sum(log2(1 + maximum repository stars per runtime consumer owner)). Distinct owners do not prove independent adoption, production use or browser reachability. The research agent verifies package quality and author affiliation.',
  }

  return {
    report,
    state: {
      version: 1,
      cursor: state.cursor + options.seeds,
      surfaced: [
        ...new Set([
          ...state.surfaced,
          ...candidates.map(candidate => candidate.package),
        ]),
      ].sort(),
    },
  }
}

export function rankCandidates(observations, known, minimumOwners) {
  const packages = Map.groupBy(
    observations.filter(item => item.runtime && !known.has(item.package)),
    item => item.package,
  )

  return Array.from(packages, ([name, declarations]) => {
    const repositories = Map.groupBy(declarations, item => item.repo)

    const consumers = Array.from(
      repositories.values(),
      declarations => declarations[0],
    )

    const owners = Map.groupBy(consumers, item => item.owner)

    const authorityScore = Array.from(owners.values(), repositories =>
      Math.log2(1 + Math.max(...repositories.map(item => item.stars))),
    ).reduce((sum, contribution) => sum + contribution, 0)

    return { package: name, authorityScore, ownerCount: owners.size, consumers }
  })
    .filter(candidate => candidate.ownerCount >= minimumOwners)
    .sort(
      (a, b) =>
        b.authorityScore - a.authorityScore ||
        b.ownerCount - a.ownerCount ||
        a.package.localeCompare(b.package),
    )
}
