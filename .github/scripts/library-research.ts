import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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
  normalizePackageName,
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
        .max(10)
        .optional(),
      reason: researchText(60),
      recommendations: z
        .array(
          z
            .object({
              package: researchText()
                .transform(normalizePackageName)
                .refine(isPlausiblePackageName, 'Invalid npm package'),
              repository: researchText().regex(
                /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/,
              ),
              reason: researchText(60),
              discovery: z.object({
                reason: researchText(40),
                source: sourceSchema.nullable(),
              }),
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

const feedbackSchema = z
  .array(
    z.object({
      source: sourceSchema,
      comment: z.string().min(1).max(65000),
      response: researchText(40),
      remove: z
        .array(
          z.object({
            slug: z.string(),
            package: z.string().refine(isPlausiblePackageName),
          }),
        )
        .max(12)
        .default([]),
    }),
  )
  .max(20)
  .refine(items => unique(items.map(item => item.source)), 'Duplicate feedback')

const submissionSchema = z.object({
  proposal: proposalSchema,
  feedback: feedbackSchema.default([]),
})

type Submission = z.infer<typeof submissionSchema>

const feedbackMarker = (item: z.infer<typeof feedbackSchema>[number]) =>
  `<!-- library-feedback:${createHash('sha256')
    .update(JSON.stringify([item.source, item.comment]))
    .digest('hex')} -->`

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
    const tags = existing?.tags ?? category.tags

    if (!tags) fail('New categories require matching tags')

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

    if (existing && same(similar, existing.similar)) continue
    result[category.slug] = {
      name: existing?.name ?? category.name,
      tags,
      similar,
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
  // The proposal contract caps this fan-out at twelve candidates.
  await Promise.all(
    validateProposal(proposal).flatMap(category =>
      category.recommendations.map(async item => {
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

        if (
          z.object({ archived: z.boolean() }).parse(await repo.json()).archived
        )
          fail(`Repository archived: ${item.repository}`)
      }),
    ),
  )
}

const markdown = (value: string) => value.replace(/[\\`*_[\]#@|]/g, '\\$&')

export function researchBody(
  base: Catalog,
  catalog: Catalog,
  proposal: Proposal,
  runUrl: string,
) {
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

    const research = proposal.find(item => item.slug === slug)

    lines.push(
      `### ${markdown(category.name)}${base[slug] ? '' : ' (new category)'}`,
      '',
      markdown(
        research?.reason ??
          'Maintainer-edited category; please review its intended scope.',
      ),
      '',
    )

    for (const name of additions) {
      const item = research?.recommendations.find(item => item.package === name)
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
          `Why considered: ${markdown(item.discovery.reason)}`,
          ...(item.discovery.source
            ? [`Discovery source: [Source](<${item.discovery.source}>)`]
            : []),
          '',
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
  feedback: rawFeedback = [],
  verify = verifyPackages,
  runUrl = 'Manual research run',
}: {
  api: GitHubApi
  proposal: unknown
  feedback?: unknown
  verify?: (proposal: Proposal) => Promise<void>
  runUrl?: string
}) {
  const proposal = validateProposal(rawProposal)
  const feedback = feedbackSchema.parse(rawFeedback)

  const repository = z
    .object({
      default_branch: z.string(),
      owner: z.object({ login: z.string() }),
    })
    .parse(await api(''))

  const baseBranch = repository.default_branch

  const [baseRefData, headRefData, prData] = await Promise.all([
    api(`/git/ref/heads/${baseBranch}`),
    api(`/git/ref/heads/${branch}`, { optional: true }),
    api(
      `/pulls?state=all&head=${encodeURIComponent(`${repository.owner.login}:${branch}`)}&sort=created&direction=desc&per_page=100`,
    ),
  ])

  const baseRef = refSchema.parse(baseRefData)
  const headRef = refSchema.nullable().parse(headRefData)
  const prs = z.array(prSchema).parse(prData)

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

    const [ancestor, pending] = await Promise.all([
      readCatalog(comparison.merge_base_commit.sha),
      readCatalog(headRef.object.sha),
    ])

    current = carryPending(base, ancestor, pending)
  }

  const updates = feedback.filter(
    item => !open[0]?.body?.includes(feedbackMarker(item)),
  )

  const revised = structuredClone(current)

  if (updates.length) {
    if (!open[0]) fail('Feedback requires an existing open research PR')

    const commentSchema = z.object({
      html_url: z.string(),
      body: z.string().nullable(),
      user: z.object({ login: z.string() }),
    })

    const readComments = async (path: string) => {
      const comments: z.infer<typeof commentSchema>[] = []

      for (let page = 1; ; page++) {
        const batch = z
          .array(commentSchema)
          .parse(await api(`${path}?per_page=100&page=${page}`))

        comments.push(...batch)

        if (batch.length < 100) return comments
      }
    }

    const comments = (
      await Promise.all([
        readComments(`/issues/${open[0].number}/comments`),
        readComments(`/pulls/${open[0].number}/comments`),
        readComments(`/pulls/${open[0].number}/reviews`),
      ])
    ).flat()

    for (const item of updates) {
      const comment =
        comments.find(
          comment =>
            comment.html_url === item.source && comment.body === item.comment,
        ) ?? fail('Feedback comment is missing or changed; reread the PR')

      if (item.remove.length && comment.user.login !== repository.owner.login) {
        const permission = z
          .object({ permission: z.string() })
          .parse(
            await api(
              `/collaborators/${encodeURIComponent(comment.user.login)}/permission`,
            ),
          )

        if (!['admin', 'maintain', 'write'].includes(permission.permission))
          fail(
            'Only maintainers may request removal of pending recommendations',
          )
      }

      for (const removal of item.remove) {
        if (base[removal.slug]?.similar.includes(removal.package))
          fail('Feedback cannot remove approved recommendations')

        if (!current[removal.slug]?.similar.includes(removal.package))
          fail('Feedback removal is not a pending recommendation')

        const category = revised[removal.slug]

        if (!category?.similar.includes(removal.package)) continue

        if (
          proposal.some(
            category =>
              category.slug === removal.slug &&
              category.recommendations.some(
                item => item.package === removal.package,
              ),
          )
        )
          fail('Do not re-propose a rejected recommendation')
        category.similar = category.similar.filter(
          name => name !== removal.package,
        )

        if (!category.similar.length) delete revised[removal.slug]
      }
    }
  }

  const catalog = mergeProposal(revised, proposal)

  for (const [slug, category] of Object.entries(catalog))
    if (!base[slug] && category.similar.length < 2)
      fail('New categories need at least two alternatives after feedback')
  await verify(proposal)
  const changed = !same(current, catalog)

  if (!changed && !updates.length && open[0])
    return { status: 'unchanged', url: open[0].html_url }

  if (!changed && !updates.length && same(base, catalog))
    return { status: 'no changes' }

  const start = '<!-- library-research:start -->'
  const end = '<!-- library-research:end -->'
  let pr = open[0]
  const previousBody = pr?.body ?? ''

  const from = previousBody.indexOf(start),
    to = previousBody.indexOf(end)

  const previousSummary =
    from >= 0 && to > from
      ? previousBody.slice(from + start.length, to).trim()
      : ''

  const summary = [
    previousSummary,
    researchBody(pr ? current : base, catalog, proposal, runUrl),
    ...updates.map(
      item =>
        `### Review feedback\n\n[Comment](<${item.source}>)\n\n${markdown(item.response)}\n\n${feedbackMarker(item)}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')

  const section = `${start}\n${summary}\n${end}`

  const body =
    from >= 0 && to > from
      ? previousBody.slice(0, from) +
        section +
        previousBody.slice(to + end.length)
      : [previousBody, section].filter(Boolean).join('\n\n')

  if (body.length > 60000)
    fail(
      'Review or merge the pending research PR before accumulating more recommendations',
    )

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

  if (pr) {
    await api(`/pulls/${pr.number}`, {
      method: 'PATCH',
      body: { body },
    })
  } else {
    pr = prSchema.parse(
      await api('/pulls', {
        method: 'POST',
        body: {
          title: 'Refresh similar-library recommendations',
          head: branch,
          base: baseBranch,
          body,
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

export async function readResearchSubmission(
  outputPath: string,
  proposalPath: string,
): Promise<Submission> {
  const output = z
    .object({
      items: z.array(
        z.object({
          type: z.string(),
          proposal: z.string().optional(),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(outputPath, 'utf8')))

  const items = output.items.filter(
    item => item.type === 'publish_library_research',
  )

  if (items.length !== 1 || !items[0].proposal)
    fail('Expected exactly one research proposal')

  z.literal('proposal.json').parse(items[0].proposal)

  return submissionSchema.parse(
    JSON.parse(await readFile(proposalPath, 'utf8')),
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = z
    .object({
      GH_AW_AGENT_OUTPUT: z.string().min(1),
      LIBRARY_RESEARCH_PROPOSAL: z.string().min(1),
      GITHUB_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      GITHUB_TOKEN: z.string().min(1),
      GITHUB_RUN_ID: z.string().regex(/^\d+$/),
    })
    .parse(process.env)

  const submission = await readResearchSubmission(
    env.GH_AW_AGENT_OUTPUT,
    env.LIBRARY_RESEARCH_PROPOSAL,
  )

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
      ...submission,
      runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    }),
  )
}
