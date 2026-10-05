import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  extractGitHubRepository,
  isPlausiblePackageName,
} from './recommendation-quality.mjs'

export const branch = 'codex/library-catalog'

export const catalogPath = 'utils/similar-packages.catalog.json'

const fail = message => {
  throw new Error(message)
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function text(value, minimum = 1) {
  // This is the untrusted JSON boundary; the checks establish the string contract.
  if (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof
    typeof value !== 'string' ||
    value.trim().length < minimum ||
    value.length > 2000 ||
    /[<>]/.test(value) ||
    [...value].some(character => character.charCodeAt(0) < 32)
  )
    fail('Invalid research text')

  return value.trim()
}

export function validateProposal(proposal) {
  if (!Array.isArray(proposal) || proposal.length > 5)
    fail('Expected at most five category proposals')
  const slugs = new Set()
  let count = 0

  return proposal.map(category => {
    const slug = text(category.slug)

    if (
      !/^[a-z][a-z0-9-]{1,79}$/.test(slug) ||
      ['constructor', 'prototype'].includes(slug) ||
      slugs.has(slug)
    )
      fail('Invalid or repeated category')
    slugs.add(slug)

    if (
      !Array.isArray(category.tags) ||
      !category.tags.length ||
      category.tags.length > 10
    )
      fail('Category needs matching tags')

    const tags = category.tags.map(({ tag, weight }) => {
      if (!Number.isInteger(weight) || weight < 1 || weight > 15)
        fail('Invalid tag weight')

      return { tag: text(tag), weight }
    })

    if (
      !Array.isArray(category.recommendations) ||
      !category.recommendations.length ||
      category.recommendations.length > 6
    )
      fail('Expected one to six recommendations')
    const names = new Set()

    const recommendations = category.recommendations.map(item => {
      const name = text(item.package)

      if (!isPlausiblePackageName(name) || names.has(name))
        fail('Invalid or repeated npm package')
      names.add(name)
      const repository = text(item.repository)

      if (
        !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(
          repository,
        )
      )
        fail('Expected owner/repository')

      if (
        !Array.isArray(item.sources) ||
        item.sources.length < 2 ||
        item.sources.length > 5
      )
        fail('Provide primary evidence and a discovery or corroborating source')

      const sources = [
        ...new Set(
          item.sources.map(source => {
            const url = new URL(text(source))

            if (
              url.protocol !== 'https:' ||
              url.username ||
              url.password ||
              url.port ||
              !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
              /(^|\.)(localhost|local|internal)$/i.test(url.hostname)
            )
              fail('Expected a public HTTPS source')

            return url.href
          }),
        ),
      ]

      if (
        sources.length < 2 ||
        !sources.some(
          source =>
            source === `https://github.com/${repository}` ||
            source.startsWith(`https://github.com/${repository}/`),
        )
      )
        fail('Include the actual maintainer repository as primary evidence')

      return {
        package: name,
        repository,
        reason: text(item.reason, 60),
        tradeoffs: text(item.tradeoffs, 40),
        sources,
      }
    })

    count += recommendations.length

    if (count > 12) fail('At most twelve recommendations per run')

    return {
      slug,
      name: text(category.name),
      tags,
      reason: text(category.reason, 60),
      recommendations,
    }
  })
}

export function mergeProposal(catalog, proposal) {
  const result = structuredClone(catalog)

  for (const category of validateProposal(proposal)) {
    const existing = result[category.slug]

    const similar = [
      ...new Set([
        ...(existing?.similar ?? []),
        ...category.recommendations.map(item => item.package),
      ]),
    ]

    if (similar.length > 6 || (!existing && similar.length < 2))
      fail(
        'Categories need two to six alternatives; do not remove existing recommendations automatically',
      )
    const recommendations = { ...existing?.research?.recommendations }

    for (const item of category.recommendations) {
      // Repeated discovery is a no-op; maintainers own existing rationale.
      if (!existing?.similar.includes(item.package))
        recommendations[item.package] = item
    }

    if (existing && same(similar, existing.similar)) continue
    result[category.slug] = {
      name: existing?.name ?? category.name,
      tags: existing?.tags ?? category.tags,
      similar,
      research: {
        reason: existing?.research?.reason ?? category.reason,
        recommendations,
      },
    }
  }

  return result
}

// Three-way merge preserves pending edits without overwriting newer approved data.
export function carryPending(base, ancestor, pending) {
  const result = structuredClone(base)

  for (const slug of new Set([
    ...Object.keys(ancestor),
    ...Object.keys(pending),
  ])) {
    if (same(ancestor[slug], pending[slug])) continue

    if (!same(base[slug], ancestor[slug]) && !same(base[slug], pending[slug]))
      fail(`Maintainer resolution needed for ${slug}`)

    if (pending[slug]) result[slug] = pending[slug]
    else delete result[slug]
  }

  return result
}

export async function verifyPackages(
  proposal,
  fetchImpl = fetch,
  githubToken = process.env.GITHUB_TOKEN,
) {
  for (const category of validateProposal(proposal)) {
    for (const item of category.recommendations) {
      const response = await fetchImpl(
        `https://registry.npmjs.org/${encodeURIComponent(item.package)}/latest`,
        { signal: AbortSignal.timeout(15000), redirect: 'error' },
      )

      if (!response.ok)
        fail(`Cannot verify npm package ${item.package}: ${response.status}`)
      const manifest = await response.json()

      if (
        manifest.name !== item.package ||
        manifest.deprecated ||
        extractGitHubRepository(manifest.repository) !== item.repository
      )
        fail(`Invalid, deprecated, or mismatched package ${item.package}`)

      // Never fetch agent-provided URLs with credentials. Only verify its registry-linked GitHub repository.
      const headers = { Accept: 'application/vnd.github+json' }

      if (githubToken) headers.Authorization = `Bearer ${githubToken}`

      const repo = await fetchImpl(
        `https://api.github.com/repos/${item.repository}`,
        {
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
          headers,
        },
      )

      if (!repo.ok)
        fail(`Cannot verify repository ${item.repository}: ${repo.status}`)

      if ((await repo.json()).archived)
        fail(`Repository archived: ${item.repository}`)
    }
  }
}

const markdown = value => value.replace(/[\\`*_[\]#@|]/g, '\\$&')

export function researchBody(base, catalog, runUrl) {
  const lines = [
    '## Weekly library research',
    '',
    'Human review required. These are use-case alternatives, not popularity rankings. No automatic merge.',
    '',
  ]

  for (const [slug, category] of Object.entries(catalog)) {
    const additions = category.similar.filter(
      name => !base[slug]?.similar.includes(name),
    )

    if (!additions.length) continue
    lines.push(
      `### ${markdown(category.name)}${base[slug] ? '' : ' (new category)'}`,
      '',
      markdown(
        category.research?.reason ??
          'Maintainer-edited category; please review its intended scope.',
      ),
      '',
    )

    for (const name of additions) {
      const item = category.research?.recommendations[name]
      lines.push(
        `#### ${markdown(name)}`,
        '',
        `Compared with: ${category.similar
          .filter(other => other !== name)
          .map(markdown)
          .join(', ')}`,
        '',
      )

      if (item)
        lines.push(
          `Why: ${markdown(item.reason)}`,
          '',
          `Trade-offs: ${markdown(item.tradeoffs)}`,
          '',
          ...item.sources.map(url => `- [Source](<${url}>)`),
          '',
        )
      else
        lines.push(
          'Maintainer-added recommendation; rationale needs review.',
          '',
        )
    }
  }

  lines.push(
    `Research run: ${runUrl}`,
    '',
    'The automated checks verify package identity and catalog constraints, not the truth of every research claim. Review the cited documentation before merging.',
  )

  return lines.join('\n')
}

export async function publishResearch({
  api,
  proposal,
  verify = verifyPackages,
  runUrl,
}) {
  proposal = validateProposal(proposal)
  const repository = await api('')
  const baseBranch = repository.default_branch
  const baseRef = await api(`/git/ref/heads/${baseBranch}`)
  const headRef = await api(`/git/ref/heads/${branch}`, { optional: true })

  const prs = await api(
    `/pulls?state=all&head=${repository.owner.login}:${branch}&sort=created&direction=desc&per_page=100`,
  )

  const open = prs.filter(pr => pr.state === 'open')

  if (open.length > 1) fail('Multiple research PRs found; resolve manually')

  if (prs[0]?.state === 'closed' && !prs[0].merged_at)
    fail('Research PR was rejected. Reopen it explicitly to resume publishing.')

  if (open[0] && open[0].base.ref !== baseBranch)
    fail('Unexpected research PR target')

  const readCatalog = async sha => {
    const file = await api(`/contents/${catalogPath}?ref=${sha}`)

    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  }

  const base = await readCatalog(baseRef.object.sha)
  let current = base

  if (headRef && !prs[0]?.merged_at) {
    const comparison = await api(
      `/compare/${baseRef.object.sha}...${headRef.object.sha}`,
    )

    if (
      comparison.files?.length >= 300 ||
      comparison.files?.some(file => file.filename !== catalogPath)
    )
      fail('Research branch contains non-catalog changes')
    current = carryPending(
      base,
      await readCatalog(comparison.merge_base_commit.sha),
      await readCatalog(headRef.object.sha),
    )
  }

  await verify(proposal)
  const catalog = mergeProposal(current, proposal)
  const changed = !same(current, catalog)
  const summary = researchBody(base, catalog, runUrl)

  if (summary.length > 60000)
    fail(
      'Review or merge the pending research PR before accumulating more recommendations',
    )

  if (!changed && same(base, catalog)) return { status: 'no changes' }

  if (changed) {
    const baseCommit = await api(`/git/commits/${baseRef.object.sha}`)

    const blob = await api('/git/blobs', {
      method: 'POST',
      body: {
        content: `${JSON.stringify(catalog, null, 2)}\n`,
        encoding: 'utf-8',
      },
    })

    const tree = await api('/git/trees', {
      method: 'POST',
      body: {
        base_tree: baseCommit.tree.sha,
        tree: [
          { path: catalogPath, mode: '100644', type: 'blob', sha: blob.sha },
        ],
      },
    })

    const commit = await api('/git/commits', {
      method: 'POST',
      body: {
        message: 'Update evidence-backed library recommendations',
        tree: tree.sha,
        parents: [
          ...new Set([headRef?.object.sha, baseRef.object.sha].filter(Boolean)),
        ],
        author: {
          name: 'Shubham Kanodia',
          email: 'shubham.kanodia10@gmail.com',
        },
      },
    })

    // Compare-and-swap plus non-force update prevents lost maintainer edits.
    const latest = await api(`/git/ref/heads/${branch}`, { optional: true })

    if (latest?.object.sha !== headRef?.object.sha)
      fail('Research branch changed during publishing; retry')

    if (headRef)
      await api(`/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      })
    else
      await api('/git/refs', {
        method: 'POST',
        body: { ref: `refs/heads/${branch}`, sha: commit.sha },
      })
  }

  const start = '<!-- library-research:start -->'
  const end = '<!-- library-research:end -->'
  const section = `${start}\n${summary}\n${end}`
  let pr = open[0]

  if (pr) {
    const body = pr.body ?? ''

    const from = body.indexOf(start),
      to = body.indexOf(end)

    await api(`/pulls/${pr.number}`, {
      method: 'PATCH',
      body: {
        body:
          from >= 0 && to > from
            ? body.slice(0, from) + section + body.slice(to + end.length)
            : `${body}\n\n${section}`,
      },
    })
  } else {
    pr = await api('/pulls', {
      method: 'POST',
      body: {
        title: 'Refresh similar-library recommendations',
        head: branch,
        base: baseBranch,
        body: section,
        draft: true,
      },
    })
  }

  // GITHUB_TOKEN-created PRs do not trigger pull_request CI. Dispatch it explicitly.
  if (changed)
    await api('/actions/workflows/ci.yml/dispatches', {
      method: 'POST',
      body: { ref: branch },
    })

  return { status: changed ? 'published' : 'unchanged', url: pr.html_url }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.env.GH_AW_DETECTION_SUCCESS !== 'true') {
    fail('Research threat detection did not approve publication')
  }

  const output = JSON.parse(
    await readFile(process.env.GH_AW_AGENT_OUTPUT, 'utf8'),
  )

  const items =
    output.items?.filter(item => item.type === 'publish_library_research') ?? []

  if (items.length !== 1) fail('Expected exactly one research proposal')
  const repo = process.env.GITHUB_REPOSITORY

  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) fail('Invalid GitHub repository')

  const api = async (path, { method = 'GET', body, optional = false } = {}) => {
    const response = await fetch(
      `https://api.github.com/repos/${repo}${path}`,
      {
        method,
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: body && JSON.stringify(body),
      },
    )

    if (optional && response.status === 404) return null

    if (!response.ok) fail(`GitHub ${method} ${path}: ${response.status}`)

    return response.status === 204 ? null : response.json()
  }

  console.log(
    await publishResearch({
      api,
      proposal: JSON.parse(items[0].proposal),
      runUrl: `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  )
}
