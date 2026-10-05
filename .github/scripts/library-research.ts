import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { request } from '@octokit/request'
import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import {
  catalogSchema,
  type Catalog,
} from '@bundlephobia/service-contracts/recommendations'
import {
  extractGitHubRepository,
  isPlausiblePackageName,
  type FetchJson,
} from './recommendation-quality.ts'

export const branch = 'codex/library-catalog'

export const catalogPath = 'utils/similar-packages.catalog.json'

const fail = (message: string): never => {
  throw new Error(message)
}

const same = isDeepStrictEqual

const researchText = (minimum = 1) =>
  z
    .string()
    .max(2000)
    .refine(
      value =>
        !/[<>]/.test(value) &&
        [...value].every(character => character.charCodeAt(0) >= 32),
      'Invalid research text',
    )
    .trim()
    .min(minimum)

const unique = <T>(items: T[]) => new Set(items).size === items.length

const sourceSchema = z
  .url()
  .refine(value => {
    const url = new URL(value)

    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
      !/(^|\.)(localhost|local|internal)$/i.test(url.hostname)
    )
  }, 'Expected a public HTTPS source')
  .transform(value => new URL(value).href)

const proposalSchema = z
  .array(
    z.object({
      slug: researchText()
        .regex(/^[a-z][a-z0-9-]{1,79}$/)
        .refine(value => !['constructor', 'prototype'].includes(value)),
      name: researchText(),
      tags: z
        .array(
          z.object({
            tag: researchText(),
            weight: z.number().int().min(1).max(15),
          }),
        )
        .min(1)
        .max(10),
      reason: researchText(60),
      recommendations: z
        .array(
          z
            .object({
              package: researchText().refine(
                isPlausiblePackageName,
                'Invalid npm package',
              ),
              repository: researchText().regex(
                /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/,
              ),
              reason: researchText(60),
              tradeoffs: researchText(40),
              sources: z
                .array(sourceSchema)
                .min(2)
                .max(5)
                .refine(unique, 'Duplicate evidence'),
            })
            .refine(
              item =>
                item.sources.some(
                  source =>
                    source === `https://github.com/${item.repository}` ||
                    source.startsWith(`https://github.com/${item.repository}/`),
                ),
              'Include the actual maintainer repository as primary evidence',
            ),
        )
        .min(1)
        .max(6)
        .refine(
          items => unique(items.map(item => item.package)),
          'Duplicate npm package',
        ),
    }),
  )
  .max(5)
  .refine(items => unique(items.map(item => item.slug)), 'Duplicate category')
  .refine(
    items =>
      items.reduce((count, item) => count + item.recommendations.length, 0) <=
      12,
    'At most twelve recommendations per run',
  )

export type Proposal = z.infer<typeof proposalSchema>

// Raw agent JSON is deliberately unknown until this schema establishes its contract.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function validateProposal(proposal: unknown): Proposal {
  return proposalSchema.parse(proposal)
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type GitHubApi = (
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH'
    body?: Record<string, JsonValue>
    optional?: boolean
  },
  // HTTP responses stay unknown until the endpoint-specific schema parses them.
  // oxlint-disable-next-line anti-slop/no-unknown-returns
) => Promise<unknown>

const shaSchema = z.object({ sha: z.string() })

const refSchema = z.object({ object: shaSchema })

const prSchema = z.object({
  number: z.number(),
  state: z.enum(['open', 'closed']),
  merged_at: z.string().nullable().optional(),
  base: z.object({ ref: z.string() }),
  body: z.string().nullable().optional(),
  html_url: z.string(),
})

export function mergeProposal(catalog: Catalog, proposal: Proposal): Catalog {
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
export function carryPending(
  base: Catalog,
  ancestor: Catalog,
  pending: Catalog,
): Catalog {
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
  proposal: Proposal,
  fetchImpl: FetchJson = fetch,
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

      const manifest = z
        .object({
          name: z.string(),
          deprecated: z.string().optional(),
          repository: z.unknown().optional(),
        })
        .parse(await response.json())

      if (
        manifest.name !== item.package ||
        manifest.deprecated ||
        extractGitHubRepository(manifest.repository) !== item.repository
      )
        fail(`Invalid, deprecated, or mismatched package ${item.package}`)

      // Never fetch agent-provided URLs with credentials. Only verify its registry-linked GitHub repository.
      const headers = new Headers({
        Accept: 'application/vnd.github+json',
      })

      if (githubToken) headers.set('Authorization', `Bearer ${githubToken}`)

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

      if (z.object({ archived: z.boolean() }).parse(await repo.json()).archived)
        fail(`Repository archived: ${item.repository}`)
    }
  }
}

const markdown = (value: string) => value.replace(/[\\`*_[\]#@|]/g, '\\$&')

export function researchBody(base: Catalog, catalog: Catalog, runUrl: string) {
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
  proposal: rawProposal,
  verify = verifyPackages,
  runUrl = 'Manual research run',
}: {
  api: GitHubApi
  proposal: unknown
  verify?: (proposal: Proposal) => Promise<void>
  runUrl?: string
}) {
  const proposal = validateProposal(rawProposal)

  const repository = z
    .object({
      default_branch: z.string(),
      owner: z.object({ login: z.string() }),
    })
    .parse(await api(''))

  const baseBranch = repository.default_branch
  const baseRef = refSchema.parse(await api(`/git/ref/heads/${baseBranch}`))

  const headRef = refSchema
    .nullable()
    .parse(await api(`/git/ref/heads/${branch}`, { optional: true }))

  const prs = z
    .array(prSchema)
    .parse(
      await api(
        `/pulls?state=all&head=${repository.owner.login}:${branch}&sort=created&direction=desc&per_page=100`,
      ),
    )

  const open = prs.filter(pr => pr.state === 'open')

  if (open.length > 1) fail('Multiple research PRs found; resolve manually')

  if (prs[0]?.state === 'closed' && !prs[0].merged_at)
    fail('Research PR was rejected. Reopen it explicitly to resume publishing.')

  if (open[0] && open[0].base.ref !== baseBranch)
    fail('Unexpected research PR target')

  const readCatalog = async (sha: string): Promise<Catalog> => {
    const file = z
      .object({ content: z.string() })
      .parse(await api(`/contents/${catalogPath}?ref=${sha}`))

    return catalogSchema.parse(
      JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')),
    )
  }

  const base = await readCatalog(baseRef.object.sha)
  let current = base

  if (headRef && !prs[0]?.merged_at) {
    const comparison = z
      .object({
        files: z.array(z.object({ filename: z.string() })),
        merge_base_commit: shaSchema,
      })
      .parse(
        await api(`/compare/${baseRef.object.sha}...${headRef.object.sha}`),
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
    const baseCommit = z
      .object({ tree: shaSchema })
      .parse(await api(`/git/commits/${baseRef.object.sha}`))

    const blob = shaSchema.parse(
      await api('/git/blobs', {
        method: 'POST',
        body: {
          content: `${JSON.stringify(catalog, null, 2)}\n`,
          encoding: 'utf-8',
        },
      }),
    )

    const tree = shaSchema.parse(
      await api('/git/trees', {
        method: 'POST',
        body: {
          base_tree: baseCommit.tree.sha,
          tree: [
            { path: catalogPath, mode: '100644', type: 'blob', sha: blob.sha },
          ],
        },
      }),
    )

    const commit = shaSchema.parse(
      await api('/git/commits', {
        method: 'POST',
        body: {
          message: 'Update evidence-backed library recommendations',
          tree: tree.sha,
          parents: [
            ...new Set([
              ...(headRef ? [headRef.object.sha] : []),
              baseRef.object.sha,
            ]),
          ],
          author: {
            name: 'Shubham Kanodia',
            email: 'shubham.kanodia10@gmail.com',
          },
        },
      }),
    )

    // Compare-and-swap plus non-force update prevents lost maintainer edits.
    const latest = refSchema
      .nullable()
      .parse(await api(`/git/ref/heads/${branch}`, { optional: true }))

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
    pr = prSchema.parse(
      await api('/pulls', {
        method: 'POST',
        body: {
          title: 'Refresh similar-library recommendations',
          head: branch,
          base: baseBranch,
          body: section,
          draft: true,
        },
      }),
    )
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

  const env = z
    .object({
      GH_AW_AGENT_OUTPUT: z.string().min(1),
      GITHUB_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      GITHUB_TOKEN: z.string().min(1),
      GITHUB_RUN_ID: z.string().regex(/^\d+$/),
    })
    .parse(process.env)

  const output = z
    .object({
      items: z.array(
        z.object({
          type: z.string(),
          proposal: z.string().optional(),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(env.GH_AW_AGENT_OUTPUT, 'utf8')))

  const items = output.items.filter(
    item => item.type === 'publish_library_research',
  )

  if (items.length !== 1 || !items[0].proposal)
    fail('Expected exactly one research proposal')

  const github = request.defaults({
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}` },
    request: { redirect: 'error' },
  })

  const api: GitHubApi = async (
    path,
    { method = 'GET', body, optional = false } = {},
  ) => {
    try {
      const response = await github({
        method,
        url: `/repos/${env.GITHUB_REPOSITORY}${path}`,
        data: body,
        request: { signal: AbortSignal.timeout(30000) },
      })

      return response.status === 204 ? null : response.data
    } catch (error) {
      if (
        optional &&
        error instanceof Error &&
        'status' in error &&
        error.status === 404
      )
        return null
      // Do not print request metadata or credentials into Actions logs.
      fail(`GitHub ${method} ${path} failed`)
    }
  }

  console.log(
    await publishResearch({
      api,
      proposal: JSON.parse(z.string().parse(items[0].proposal)),
      runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    }),
  )
}
