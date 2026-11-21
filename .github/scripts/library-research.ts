import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { request } from '@octokit/request'
import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import {
  catalogSchema,
  type Catalog,
} from '@bundlephobia/service-contracts/recommendations'
import {
  collectBundleSize,
  collectPackageSignals,
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
        !/<\s*[a-z!/]/i.test(value) &&
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

const submissionSchema = z.object({
  proposal: proposalSchema,
  catalog: catalogSchema.optional(),
  summary: z.string().trim().min(1).max(60000),
  expectedHead: z.string().min(1).nullable(),
})

type Submission = z.infer<typeof submissionSchema>

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
            version: z.string().min(1),
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

        const bundle = await collectBundleSize(
          `${item.package}@${manifest.version}`,
          { fetchImpl },
        )

        if (!bundle.available || bundle.version !== manifest.version)
          fail(
            `Cannot verify a usable bundle for ${item.package}@${manifest.version}; retry before publishing`,
          )
      }),
    ),
  )
}

export type PendingPackageMetrics = {
  packageName: string
  version: string | null
  size: number | null
  gzip: number | null
  weeklyDownloads: number | null
  githubStars: number | null
  publishedAt: string | null
  license: string | null
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes))
    return '—'

  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`

  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} kB`

  return `${Math.round(bytes)} B`
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—'

  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`

  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`

  return String(Math.round(value))
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return '—'

  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export const selectionStart = '<!-- library-selection:start -->'

export const selectionEnd = '<!-- library-selection:end -->'

export const rejectedStart = '<!-- library-rejected:start -->'

export const rejectedEnd = '<!-- library-rejected:end -->'

export const overviewStart = '<!-- library-overview:start -->'

export const overviewEnd = '<!-- library-overview:end -->'

export type SelectionItem = { slug: string; package: string }

export type SelectionChecklist = {
  checked: SelectionItem[]
  unchecked: SelectionItem[]
}

export type PrunedCatalogResult = {
  catalog: Catalog
  removed: Array<{ slug: string; package: string; reason: string }>
}

export function parseSelectionChecklist(body = ''): SelectionChecklist {
  const from = body.indexOf(selectionStart)
  const to = body.indexOf(selectionEnd)

  if (from < 0 || to <= from) return { checked: [], unchecked: [] }

  const block = body.slice(from + selectionStart.length, to)
  const checked: SelectionItem[] = []
  const unchecked: SelectionItem[] = []

  const pattern = /^- \[([ xX])\] `([^`]+)` \(`([a-z][a-z0-9-]*)`\)/gm

  for (const match of block.matchAll(pattern)) {
    const item = { package: match[2], slug: match[3] }

    if (match[1].toLowerCase() === 'x') checked.push(item)
    else unchecked.push(item)
  }

  return { checked, unchecked }
}

export function parseRejectedPackages(body = ''): string[] {
  const from = body.indexOf(rejectedStart)
  const to = body.indexOf(rejectedEnd)

  if (from < 0 || to <= from) return []

  const block = body.slice(from + rejectedStart.length, to)
  const packages: string[] = []

  for (const match of block.matchAll(/^- `([^`]+)`/gm)) {
    packages.push(match[1])
  }

  return [...new Set(packages)]
}

export function pendingAdditions(
  base: Catalog,
  catalog: Catalog,
): Array<{ slug: string; categoryName: string; package: string }> {
  const additions: Array<{
    slug: string
    categoryName: string
    package: string
  }> = []

  for (const [slug, category] of Object.entries(catalog)) {
    const baseSet = new Set(base[slug]?.similar ?? [])

    for (const pkg of category.similar) {
      if (!baseSet.has(pkg))
        additions.push({ slug, categoryName: category.name, package: pkg })
    }
  }

  return additions
}

export function pruneUncheckedFromCatalog(
  base: Catalog,
  pending: Catalog,
  unchecked: SelectionItem[],
): PrunedCatalogResult {
  const result = structuredClone(pending)
  const removed: Array<{ slug: string; package: string; reason: string }> = []

  const uncheckedBySlug = new Map<string, Set<string>>()

  for (const item of unchecked) {
    const set = uncheckedBySlug.get(item.slug) ?? new Set<string>()
    set.add(item.package)
    uncheckedBySlug.set(item.slug, set)
  }

  for (const [slug, packagesToRemove] of uncheckedBySlug) {
    const category = result[slug]

    if (!category) continue
    const baseSet = new Set(base[slug]?.similar ?? [])

    const kept: string[] = []

    for (const pkg of category.similar) {
      if (packagesToRemove.has(pkg) && !baseSet.has(pkg)) {
        removed.push({ slug, package: pkg, reason: 'unchecked by maintainer' })
      } else {
        kept.push(pkg)
      }
    }

    if (!base[slug] && kept.length < 2) {
      for (const pkg of kept) {
        removed.push({
          slug,
          package: pkg,
          reason: 'new category fell below 2 alternatives',
        })
      }

      delete result[slug]
    } else {
      result[slug] = { ...category, similar: kept }
    }
  }

  return { catalog: result, removed }
}

export function renderPendingOverview(
  base: Catalog,
  catalog: Catalog,
  metrics: Map<string, PendingPackageMetrics>,
  rejected: string[] = [],
): string {
  const additions = pendingAdditions(base, catalog)
  const sections: string[] = []

  if (additions.length > 0) {
    const rows = additions.map(entry => {
      const m = metrics.get(entry.package)
      const version = m?.version ? `\`${m.version}\`` : '—'

      const sizes =
        m?.size !== null && m?.size !== undefined
          ? `${formatBytes(m.size)} / ${formatBytes(m.gzip)}`
          : '—'

      return `| ${entry.categoryName} | \`${entry.package}\` | ${version} | ${sizes} | ${formatCompactNumber(m?.weeklyDownloads)} | ${formatCompactNumber(m?.githubStars)} | ${formatMonthYear(m?.publishedAt)} | ${m?.license ?? '—'} |`
    })

    sections.push(
      [
        '### Pending additions',
        '',
        '| Category | Package | Version | Min / Gzip | Downloads/wk | Stars | Published | License |',
        '| --- | --- | --- | ---: | ---: | ---: | --- | --- |',
        ...rows,
      ].join('\n'),
    )

    const checklistLines = additions.map(
      entry => `- [x] \`${entry.package}\` (\`${entry.slug}\`)`,
    )

    sections.push(
      [
        '### Selection checklist',
        '',
        'Uncheck any package you do not want to merge, then comment `/sync` on this PR (or wait for the next weekly run) to update `utils/similar-packages.catalog.json` with only your checked selections.',
        '',
        selectionStart,
        ...checklistLines,
        selectionEnd,
      ].join('\n'),
    )
  }

  const uniqueRejected = [...new Set(rejected)].sort()

  if (uniqueRejected.length > 0) {
    sections.push(
      [
        '<details><summary>Dismissed / unchecked packages</summary>',
        '',
        rejectedStart,
        ...uniqueRejected.map(pkg => `- \`${pkg}\``),
        rejectedEnd,
        '',
        '</details>',
      ].join('\n'),
    )
  }

  if (!sections.length) return ''

  return `${overviewStart}\n${sections.join('\n\n')}\n${overviewEnd}`
}

export async function collectPendingPackageMetrics(
  packages: string[],
  fetchImpl: FetchJson = fetch,
  githubToken = process.env.GITHUB_TOKEN,
): Promise<Map<string, PendingPackageMetrics>> {
  const results = new Map<string, PendingPackageMetrics>()

  await Promise.all(
    [...new Set(packages)].map(async packageName => {
      try {
        const signals = await collectPackageSignals(packageName, {
          fetchImpl,
          githubToken,
          includeBundleSize: true,
        })

        let license: string | null = null

        try {
          const manifestRes = await fetchImpl(
            `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
            { signal: AbortSignal.timeout(15000), redirect: 'error' },
          )

          if (manifestRes.ok) {
            const parsed = z
              .object({
                license: z
                  .union([
                    z.string(),
                    z.object({ type: z.string() }).transform(item => item.type),
                  ])
                  .optional(),
              })
              .safeParse(await manifestRes.json())

            if (parsed.success && parsed.data.license) {
              license = parsed.data.license
            }
          }
        } catch {
          // License is advisory for the PR table.
        }

        results.set(packageName, {
          packageName,
          version: signals.latestVersion ?? null,
          size: signals.bundleSize?.available ? signals.bundleSize.size : null,
          gzip: signals.bundleSize?.available ? signals.bundleSize.gzip : null,
          weeklyDownloads: signals.weeklyDownloads ?? null,
          githubStars: signals.githubStars ?? null,
          publishedAt: signals.publishedAt ?? null,
          license,
        })
      } catch {
        // Best-effort metrics enrichment for the PR table.
      }
    }),
  )

  return results
}

export async function publishResearch({
  api,
  proposal: rawProposal,
  catalog: rawCatalog,
  summary: agentSummary,
  expectedHead,
  verify = verifyPackages,
  collectMetrics,
}: {
  api: GitHubApi
  proposal: unknown
  catalog?: Catalog
  summary: string
  expectedHead: string | null
  verify?: (proposal: Proposal) => Promise<void>
  collectMetrics?: (
    packages: string[],
  ) => Promise<Map<string, PendingPackageMetrics>>
}) {
  const proposal = validateProposal(rawProposal)

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
  let snapshot = base

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
    snapshot = pending
  }

  let pr = open[0]
  const previousBody = pr?.body ?? ''
  const { unchecked } = parseSelectionChecklist(previousBody)
  const previouslyRejected = parseRejectedPackages(previousBody)

  let prunedRejected: string[] = []

  if (unchecked.length > 0 && !rawCatalog) {
    const pruned = pruneUncheckedFromCatalog(base, current, unchecked)
    current = pruned.catalog
    prunedRejected = pruned.removed.map(item => item.package)
  }

  if (rawCatalog && expectedHead !== (headRef?.object.sha ?? null))
    fail('Research branch changed since the agent read it; reread and retry')

  const catalog = rawCatalog
    ? carryPending(current, snapshot, catalogSchema.parse(rawCatalog))
    : mergeProposal(current, proposal)

  const known = new Set(
    Object.values(current).flatMap(category => category.similar),
  )

  const researched = new Set(
    proposal.flatMap(category =>
      category.recommendations.map(item => item.package),
    ),
  )

  for (const [slug, category] of Object.entries(catalog)) {
    if (!base[slug] && category.similar.length < 2)
      fail('New categories need at least two alternatives')

    for (const name of category.similar)
      if (!known.has(name) && !researched.has(name))
        fail(`New package requires research evidence: ${name}`)
  }

  await verify(proposal)
  const changed = prunedRejected.length > 0 || !same(current, catalog)

  if (!changed && !open[0] && same(base, catalog))
    return { status: 'no changes' }

  const start = '<!-- library-research:start -->'
  const end = '<!-- library-research:end -->'

  const from = previousBody.indexOf(start),
    to = previousBody.indexOf(end)

  const summary = submissionSchema.shape.summary.parse(agentSummary)
  const pending = pendingAdditions(base, catalog)

  const metricsCollector =
    collectMetrics ??
    (verify === verifyPackages
      ? collectPendingPackageMetrics
      : async () => new Map<string, PendingPackageMetrics>())

  const metrics =
    pending.length > 0
      ? await metricsCollector(pending.map(entry => entry.package))
      : new Map<string, PendingPackageMetrics>()

  const rejected = [...new Set([...previouslyRejected, ...prunedRejected])]
  const overview = renderPendingOverview(base, catalog, metrics, rejected)
  const inner = overview ? `${overview}\n\n${summary}` : summary
  const section = `${start}\n${inner}\n${end}`

  const body =
    from >= 0 && to > from
      ? previousBody.slice(0, from) +
        section +
        previousBody.slice(to + end.length)
      : [previousBody, section].filter(Boolean).join('\n\n')

  if (!changed && body === previousBody)
    return { status: 'unchanged', url: pr?.html_url }

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
          content: execFileSync(
            'corepack',
            [
              'yarn',
              'workspace',
              '@bundlephobia/recommendation-automation',
              'format',
              '--stdin-filepath',
              `../${catalogPath}`,
            ],
            { input: JSON.stringify(catalog), encoding: 'utf8' },
          ),
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

  return { status: changed ? 'published' : 'updated', url: pr.html_url }
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
    }),
  )
}
