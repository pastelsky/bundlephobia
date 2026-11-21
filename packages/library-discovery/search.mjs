import {
  selectManifestPaths,
  loadManifests,
  observeManifests,
} from './manifests.mjs'

export function retryAfterMs(error, nowMs = Date.now()) {
  const status = error?.status ?? error?.response?.status
  const message = String(error?.message ?? '')
  const headers = error?.response?.headers ?? {}

  const isRateLimit =
    status === 429 ||
    (status === 403 &&
      (headers['retry-after'] !== undefined ||
        headers['x-ratelimit-remaining'] === '0' ||
        /rate limit|try again in/i.test(message))) ||
    /try again in \d+(?:\.\d+)?s/i.test(message)

  if (!isRateLimit) return null

  const retryHeader = Number(headers['retry-after'])

  if (Number.isFinite(retryHeader) && retryHeader > 0)
    return Math.ceil(retryHeader * 1000) + 500

  const match = message.match(/try again in (\d+(?:\.\d+)?)s/i)

  if (match) return Math.ceil(Number(match[1]) * 1000) + 500

  const resetEpoch = Number(headers['x-ratelimit-reset'])

  if (
    headers['x-ratelimit-remaining'] === '0' &&
    Number.isFinite(resetEpoch) &&
    resetEpoch > 0
  )
    return Math.max(1000, resetEpoch * 1000 - nowMs + 500)

  return 15_000
}

export async function withRateLimitRetry(
  fn,
  {
    maxRetries = 2,
    maxWaitMs = 65_000,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
  } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const waitMs = retryAfterMs(error, now())

      if (waitMs === null || attempt >= maxRetries || waitMs > maxWaitMs)
        throw error

      await sleep(waitMs)
    }
  }
}

export async function discoverHackerNewsStories(
  fetchImpl,
  {
    now = new Date(),
    lookbackDays = 14,
    minPoints = 25,
    maxStories = 20,
    notes = [],
  } = {},
) {
  if (!fetchImpl) return []

  const sinceUnix = Math.floor(
    (now.getTime() - lookbackDays * 86_400_000) / 1000,
  )

  const queries = [
    'javascript OR typescript',
    'npm OR bundler OR webassembly',
    'react OR vue OR svelte OR browser',
  ]

  const stories = new Map()

  for (const query of queries) {
    try {
      const url = new URL('https://hn.algolia.com/api/v1/search_by_date')
      url.searchParams.set('query', query)
      url.searchParams.set('tags', 'story')
      url.searchParams.set(
        'numericFilters',
        `points>=${minPoints},created_at_i>${sinceUnix}`,
      )
      url.searchParams.set('hitsPerPage', '50')

      const response = await fetchImpl(String(url), {
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        notes.push(`Unavailable HN search (${query}): HTTP ${response.status}`)
        continue
      }

      const data = await response.json()

      for (const hit of data?.hits ?? []) {
        if (!hit?.objectID || !hit?.title || stories.has(hit.objectID)) continue
        stories.set(hit.objectID, {
          title: hit.title,
          url:
            hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          points: Number(hit.points ?? 0),
          comments: Number(hit.num_comments ?? 0),
          createdAt: hit.created_at ?? null,
        })
      }
    } catch (error) {
      notes.push(`Unavailable HN search (${query}): ${error.message}`)
    }
  }

  return [...stories.values()]
    .sort((a, b) => b.points - a.points || a.title.localeCompare(b.title))
    .slice(0, maxStories)
}

export function rotate(items, cursor, count) {
  if (!items.length) return []

  return Array.from(
    { length: Math.min(count, items.length) },
    (_, i) => items[(cursor + i) % items.length],
  )
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

    if (kind === 'repositories') parameters.sort = 'stars'

    const result = await github(`GET /search/${kind}`, parameters)

    for (const item of result.items) {
      if (kind === 'code') {
        // REST code search uses legacy qualifiers; visibility is filtered from metadata.
        if (!item.repository.private)
          found.push({ repo: item.repository.full_name, paths: [item.path] })
      } else found.push({ repo: item.full_name, paths: [] })
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

export async function findRepositories(github, seeds, cursor, options, notes) {
  const pools = []

  const sources = seeds.map(seed => ({
    kind: 'code',
    query: `"${seed}" filename:package.json`,
  }))

  for (const topic of options.topics)
    sources.push({
      kind: 'repositories',
      query: `topic:${topic} stars:>=${options.minimumStars} fork:false archived:false pushed:>=${options.activeSince}`,
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

      pools.push(rotate(matches, cursor, matches.length))
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

  return { pools, repositories }
}

async function scanRepository(github, source, options, notes) {
  const [owner, repo] = source.repo.split('/')
  const metadata = await github('GET /repos/{owner}/{repo}', { owner, repo })

  if (
    !Number.isSafeInteger(metadata.stargazers_count) ||
    metadata.stargazers_count < 0
  )
    throw new Error(`Invalid repository star count: ${source.repo}`)

  if (
    metadata.private ||
    metadata.fork ||
    metadata.archived ||
    metadata.stargazers_count < options.minimumStars ||
    metadata.pushed_at < options.activeSince
  )
    return []

  if (
    /(?:^|[-/ ])(?:awesome|boilerplate|starter|tutorial|template|benchmarks?)(?:[-/ ]|$)/i.test(
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

  const entries = selectManifestPaths(tree, source, options, notes)
  const manifests = await loadManifests(github, source.repo, entries)

  return observeManifests(manifests, {
    repo: source.repo,
    sha: commit.sha,
    stars: metadata.stargazers_count,
    frameworks: options.frameworks,
  })
}

export async function scanRepositories(github, repositories, options, notes) {
  const observations = []

  for (const repo of repositories) {
    try {
      observations.push(...(await scanRepository(github, repo, options, notes)))
    } catch (error) {
      notes.push(`Repository unavailable: ${repo.repo}: ${error.message}`)
    }
  }

  return observations
}
