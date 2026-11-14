import { z } from 'zod'
import validatePackageName from 'validate-npm-package-name'
import defaults from './config.json' with { type: 'json' }
import { findRepositories, scanRepositories, rotate } from './search.mjs'
import {
  eligibleCandidates,
  selectCandidates,
  checkNpmCandidates,
} from './npm.mjs'

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
  registry,
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
  options.downloadStart = date(56)
  options.downloadEnd = date(1)
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

  const eligible = eligibleCandidates(
    observations,
    known,
    options.minimumOwners,
  )

  const { qualified, packagesCheckedOnNpm } = await checkNpmCandidates(
    registry,
    eligible,
    options,
    notes,
  )

  const candidates = selectCandidates(qualified, options.candidates)

  const report = {
    observedAt: now.toISOString(),
    source: 'consumer-manifests',
    seeds,
    windows: {
      repositoryActivitySince: options.activeSince,
      npmDownloads: { start: options.downloadStart, end: options.downloadEnd },
    },
    limits: options,
    coverage: {
      repositoriesConsidered: new Set(pools.flat().map(repo => repo.repo)).size,
      repositoriesScanned: repositories.length,
      webRepositoriesObserved: new Set(observations.map(item => item.repo))
        .size,
      manifestObservations: observations.length,
      eligiblePackages: eligible.length,
      packagesCheckedOnNpm,
    },
    notes,
    candidates,
    interpretation:
      'Sampled manifest declarations, not global dependents, production use or browser import reachability. npm download growth includes indirect installs and automation; it is not measured adoption velocity.',
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
