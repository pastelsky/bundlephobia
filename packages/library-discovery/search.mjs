import { rotate } from './catalog.mjs'

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
