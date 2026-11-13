import npa from 'npm-package-arg'
import picomatch from 'picomatch'
import gitUrlParse from 'git-url-parse'
import validatePackageName from 'validate-npm-package-name'
import { z } from 'zod'

const DAY = 86_400_000

export const defaults = {
  seeds: 6,
  searchPages: 2,
  repositories: 80,
  manifestsPerRepository: 12,
  metadata: 100,
  candidates: 30,
  minimumOwners: 2,
  minimumWeeklyDownloads: 1000,
  activeDays: 90,
}

export const stateSchema = z
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

export function rotate(items, cursor, count) {
  if (!items.length) return []

  return Array.from(
    { length: Math.min(count, items.length) },
    (_, i) => items[(cursor + i) % items.length],
  )
}

export function dependencyNames(manifest) {
  const names = new Set()

  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      try {
        const parsed = npa.resolve(name, spec)
        const dependency = parsed.type === 'alias' ? parsed.subSpec : parsed

        if (
          dependency.registry &&
          validatePackageName(dependency.name).validForNewPackages
        )
          names.add(dependency.name)
      } catch {
        // Invalid, workspace-only and non-registry declarations are not npm candidates.
      }
    }
  }

  return names
}

const frameworkNames = [
  'react',
  'preact',
  'vue',
  'nuxt',
  'svelte',
  'solid-js',
  'lit',
  'lit-html',
  '@angular/core',
  'astro',
]

const ignoredPath = picomatch([
  '**/node_modules/**',
  '**/vendor/**',
  '**/examples/**',
  '**/fixtures/**',
  '**/tests/**',
  '**/docs/**',
  '**/storybook/**',
  '**/.*/**',
])

const webPath = /(?:^|\/)(?:apps?|web|frontend|client|ui|site)(?:\/|$)/

const serverPath =
  /(?:^|\/)(?:server|backend|api|cli|desktop|mobile|worker)(?:\/|$)/

export function isWebApplication(manifest) {
  const dependencies = dependencyNames(manifest)
  const scripts = Object.values(manifest.scripts ?? {}).join(' ')

  return (
    manifest.private === true &&
    frameworkNames.some(name => dependencies.has(name)) &&
    /(?:vite|nuxt|next|svelte-kit|astro|ng |webpack|react-scripts)/.test(
      scripts,
    )
  )
}

export function isTooling(name, manifest) {
  const words = `${name} ${manifest.description ?? ''}`.toLowerCase()

  return (
    name.startsWith('@types/') ||
    /(?:^|[/@-])(?:eslint|prettier|typescript|tsconfig|vitest|playwright|jest|babel|webpack|rollup|vite|grunt|gulp|tslib)(?:[/\s-]|$)/.test(
      words,
    ) ||
    /command[- ]line|\bcli\b|mcp server|code formatter|test runner|code coverage|for node\.js only|node\.js (?:middleware|server)|typescript (?:types|helper)|\btypings\b/.test(
      words,
    )
  )
}

function repositoryOwner(manifest) {
  try {
    const repository = manifest.repository?.url ?? manifest.repository

    const parsed = gitUrlParse(repository)

    return parsed.resource === 'github.com' ? parsed.owner.toLowerCase() : null
  } catch {
    return null
  }
}

function roundRobin(pools, limit) {
  const repositories = new Map()
  const longest = Math.max(0, ...pools.map(pool => pool.length))

  for (let i = 0; i < longest && repositories.size < limit; i++) {
    for (const pool of pools) {
      const item = pool[i]

      if (!item) continue
      const existing = repositories.get(item.repo)

      if (existing) existing.paths.push(...item.paths)
      else if (repositories.size < limit)
        repositories.set(item.repo, { ...item, paths: [...item.paths] })
    }
  }

  return [...repositories.values()]
}

async function search(github, query, kind, pages, notes) {
  const found = []

  for (let page = 1; page <= pages; page++) {
    const parameters = { q: query, per_page: 100, page }

    if (kind === 'repositories') parameters.sort = 'updated'

    const result = await github(`GET /search/${kind}`, parameters)

    for (const item of result.items) {
      if (kind === 'code')
        found.push({ repo: item.repository.full_name, paths: [item.path] })
      else found.push({ repo: item.full_name, paths: [] })
    }

    if (result.incomplete_results)
      notes.push(`Incomplete GitHub search: ${query}`)

    if (page * 100 >= Math.min(result.total_count, 1000)) return found

    if (page === pages)
      notes.push(
        `Search budget reached (${page * 100}/${result.total_count} matches): ${query}`,
      )
  }

  return found
}

async function readManifest(github, repo, entry) {
  const blob = await github('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
    owner: repo.split('/')[0],
    repo: repo.split('/')[1],
    file_sha: entry.sha,
  })

  if (blob.size > 1_000_000 || blob.encoding !== 'base64')
    throw new Error(`Unsupported manifest ${repo}/${entry.path}`)

  return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
}

async function scanRepository(github, source, options, notes) {
  const [owner, repo] = source.repo.split('/')
  const metadata = await github('GET /repos/{owner}/{repo}', { owner, repo })

  if (
    metadata.fork ||
    metadata.archived ||
    metadata.stargazers_count < 100 ||
    metadata.pushed_at < options.activeSince
  )
    return []

  if (
    /(?:^|[-/ ])(?:awesome|boilerplate|starter|tutorial|template)(?:[-/ ]|$)/i.test(
      `${source.repo} ${metadata.description ?? ''}`,
    )
  )
    return []

  const commit = await github('GET /repos/{owner}/{repo}/commits/{ref}', {
    owner,
    repo,
    ref: metadata.default_branch,
  })

  const tree = await github('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
    owner,
    repo,
    tree_sha: commit.sha,
    recursive: '1',
  })

  if (tree.truncated)
    throw new Error(`Truncated repository tree: ${source.repo}`)

  const paths = new Map(
    tree.tree
      .filter(
        entry =>
          entry.type === 'blob' &&
          (entry.path === 'package.json' ||
            entry.path.endsWith('/package.json')) &&
          !ignoredPath(entry.path) &&
          !serverPath.test(entry.path),
      )
      .map(entry => [entry.path, entry]),
  )

  const preferred = [
    ...new Set([
      ...source.paths,
      'package.json',
      ...[...paths.keys()].filter(path => webPath.test(path)).sort(),
    ]),
  ]

  const selected = preferred.filter(path => paths.has(path))

  if (selected.length > options.manifestsPerRepository)
    notes.push(
      `Manifest budget reached: ${source.repo} (${options.manifestsPerRepository}/${selected.length})`,
    )
  const manifests = new Map()

  for (const path of selected.slice(0, options.manifestsPerRepository))
    manifests.set(
      path,
      await readManifest(github, source.repo, paths.get(path)),
    )

  const internal = new Map(
    [...manifests].map(([path, manifest]) => [manifest.name, path]),
  )

  const queue = [...manifests.keys()].filter(path =>
    isWebApplication(manifests.get(path)),
  )

  const visited = new Set()
  const observations = []

  while (queue.length) {
    const path = queue.shift()

    if (visited.has(path)) continue
    visited.add(path)
    const manifest = manifests.get(path)

    for (const name of dependencyNames(manifest)) {
      if (internal.has(name)) queue.push(internal.get(name))
      else
        observations.push({
          package: name,
          repo: source.repo,
          owner: owner.toLowerCase(),
          manifest: `https://github.com/${source.repo}/blob/${commit.sha}/${path}`,
        })
    }

    // Workspace specs deliberately aren't registry packages; follow the loaded local manifests instead.
    for (const field of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {}))
        if (internal.has(name)) queue.push(internal.get(name))
    }
  }

  return observations
}

export function downloadSignals(downloads) {
  if (
    !Array.isArray(downloads) ||
    downloads.length !== 56 ||
    downloads.some(day => !Number.isFinite(day.downloads) || day.downloads < 0)
  )
    throw new Error('Expected 56 complete daily download observations')
  const firstDay = Date.parse(downloads[0].day)

  if (
    !Number.isFinite(firstDay) ||
    downloads.some(
      (day, i) =>
        day.day !== new Date(firstDay + i * DAY).toISOString().slice(0, 10),
    )
  )
    throw new Error('Download observations must be consecutive daily values')

  const previous28Days = downloads
    .slice(0, 28)
    .reduce((sum, day) => sum + day.downloads, 0)

  const last28Days = downloads
    .slice(28)
    .reduce((sum, day) => sum + day.downloads, 0)

  return {
    previous28Days,
    last28Days,
    weeklyDownloads: Math.floor(last28Days / 4),
    downloadGrowth: previous28Days ? last28Days / previous28Days - 1 : null,
  }
}

async function qualifyCandidate(registry, candidate, options) {
  const name = encodeURIComponent(candidate.package)
  const manifest = await registry(`https://registry.npmjs.org/${name}/latest`)

  if (
    manifest.name !== candidate.package ||
    manifest.deprecated ||
    isTooling(candidate.package, manifest)
  )
    return null
  const author = repositoryOwner(manifest)

  const consumers = candidate.consumers.filter(
    consumer => consumer.owner !== author,
  )

  if (
    new Set(consumers.map(consumer => consumer.owner)).size <
    options.minimumOwners
  )
    return null

  const result = await registry(
    `https://api.npmjs.org/downloads/range/${options.downloadStart}:${options.downloadEnd}/${name}`,
  )

  const signals = downloadSignals(result.downloads)

  if (
    result.downloads[0].day !== options.downloadStart ||
    result.downloads.at(-1).day !== options.downloadEnd
  )
    throw new Error('npm returned a different download window')

  if (signals.weeklyDownloads < options.minimumWeeklyDownloads) return null

  return {
    package: candidate.package,
    description: manifest.description ?? '',
    version: manifest.version,
    consumers,
    ...signals,
  }
}

export async function discoverLibraries({
  github,
  registry,
  catalog,
  pendingCatalog = {},
  excludedPackages = [],
  state: inputState,
  now = new Date(),
  limits = {},
}) {
  const options = { ...defaults, ...limits }
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
  const pools = []

  const sources = seeds.map(seed => ({
    kind: 'code',
    query: `"${seed}" filename:package.json`,
  }))

  for (const topic of ['vue', 'svelte', 'solidjs', 'lit', 'react', 'webapp'])
    sources.push({
      kind: 'repositories',
      query: `topic:${topic} stars:>=100 fork:false archived:false pushed:>=${options.activeSince}`,
    })

  for (const source of sources) {
    try {
      const matches = await search(
        github,
        source.query,
        source.kind,
        options.searchPages,
        notes,
      )

      pools.push(rotate(matches, state.cursor, matches.length))
    } catch (error) {
      notes.push(
        `Unavailable ${source.kind} search (${source.query}): ${error.message}`,
      )
    }
  }

  if (!pools.some(pool => pool.length))
    throw new Error(
      'No discovery sources were available; preserve previous state',
    )
  const repositories = roundRobin(pools, options.repositories)
  const observations = []

  for (const repo of repositories) {
    try {
      observations.push(...(await scanRepository(github, repo, options, notes)))
    } catch (error) {
      notes.push(`Repository unavailable: ${repo.repo}: ${error.message}`)
    }
  }

  const packages = new Map()

  for (const observation of observations) {
    if (known.has(observation.package)) continue

    if (!packages.has(observation.package))
      packages.set(observation.package, new Map())
    packages.get(observation.package).set(observation.repo, observation)
  }

  const eligible = packages
    .entries()
    .map(([name, consumers]) => ({
      package: name,
      consumers: [...consumers.values()],
    }))
    .filter(
      candidate =>
        new Set(candidate.consumers.map(consumer => consumer.owner)).size >=
        options.minimumOwners,
    )
    .toArray()
    .sort(
      (a, b) =>
        b.consumers.length - a.consumers.length ||
        a.package.localeCompare(b.package),
    )

  if (eligible.length > options.metadata)
    notes.push(
      `npm metadata budget reached (${options.metadata}/${eligible.length} packages)`,
    )
  const qualified = []

  for (const candidate of eligible.slice(0, options.metadata)) {
    try {
      const result = await qualifyCandidate(registry, candidate, options)

      if (result) qualified.push(result)
    } catch (error) {
      notes.push(
        `npm evidence unavailable: ${candidate.package}: ${error.message}`,
      )
    }
  }

  qualified.sort(
    (a, b) =>
      (b.downloadGrowth ?? 0) - (a.downloadGrowth ?? 0) ||
      b.weeklyDownloads - a.weeklyDownloads ||
      a.package.localeCompare(b.package),
  )
  const candidates = qualified.slice(0, options.candidates)

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
      packagesCheckedOnNpm: Math.min(eligible.length, options.metadata),
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
