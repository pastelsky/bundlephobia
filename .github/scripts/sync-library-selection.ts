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
  branch,
  catalogPath,
  collectPendingPackageMetrics,
  overviewEnd,
  overviewStart,
  parseRejectedPackages,
  parseSelectionChecklist,
  pendingAdditions,
  pruneUncheckedFromCatalog,
  renderPendingOverview,
  type GitHubApi,
  type PendingPackageMetrics,
} from './library-research.ts'

const shaSchema = z.object({ sha: z.string() })

const refSchema = z.object({ object: shaSchema })

const pullSchema = z.object({
  number: z.number(),
  state: z.enum(['open', 'closed']),
  head: z.object({ ref: z.string(), sha: z.string() }),
  base: z.object({ ref: z.string(), sha: z.string() }),
  body: z.string().nullable().optional(),
  html_url: z.string(),
})

function replaceOverview(body: string, nextOverview: string): string {
  const from = body.indexOf(overviewStart)
  const to = body.indexOf(overviewEnd)

  if (from >= 0 && to > from) {
    const before = body.slice(0, from).replace(/\n+$/, '')
    const after = body.slice(to + overviewEnd.length).replace(/^\n+/, '')

    return [before, nextOverview, after].filter(Boolean).join('\n\n')
  }

  return [nextOverview, body].filter(Boolean).join('\n\n')
}

export async function syncLibrarySelection({
  api,
  prNumber,
  collectMetrics = collectPendingPackageMetrics,
}: {
  api: GitHubApi
  prNumber: number
  collectMetrics?: (
    packages: string[],
  ) => Promise<Map<string, PendingPackageMetrics>>
}) {
  const pr = pullSchema.parse(await api(`/pulls/${prNumber}`))

  if (pr.state !== 'open' || pr.head.ref !== branch) {
    return { status: 'ignored', reason: 'Not an open library-catalog PR' }
  }

  const body = pr.body ?? ''
  const { unchecked } = parseSelectionChecklist(body)
  const previouslyRejected = parseRejectedPackages(body)

  if (unchecked.length === 0) {
    await api(`/issues/${prNumber}/comments`, {
      method: 'POST',
      body: {
        body: 'No unchecked packages found in the selection checklist; catalog unchanged.',
      },
    })

    return { status: 'unchanged' }
  }

  const readCatalog = async (sha: string): Promise<Catalog> => {
    const file = z
      .object({ content: z.string() })
      .parse(await api(`/contents/${catalogPath}?ref=${sha}`))

    return catalogSchema.parse(
      JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')),
    )
  }

  const [baseRefData, headRefData] = await Promise.all([
    api(`/git/ref/heads/${pr.base.ref}`),
    api(`/git/ref/heads/${branch}`),
  ])

  const baseRef = refSchema.parse(baseRefData)
  const headRef = refSchema.parse(headRefData)

  const [baseCatalog, pendingCatalog] = await Promise.all([
    readCatalog(baseRef.object.sha),
    readCatalog(headRef.object.sha),
  ])

  const { catalog: prunedCatalog, removed } = pruneUncheckedFromCatalog(
    baseCatalog,
    pendingCatalog,
    unchecked,
  )

  if (
    removed.length === 0 ||
    isDeepStrictEqual(pendingCatalog, prunedCatalog)
  ) {
    await api(`/issues/${prNumber}/comments`, {
      method: 'POST',
      body: {
        body: 'No pending additions matched the unchecked items; catalog unchanged.',
      },
    })

    return { status: 'unchanged' }
  }

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
          { input: JSON.stringify(prunedCatalog), encoding: 'utf8' },
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
        message: 'Apply maintainer library selection from PR checklist',
        tree: tree.sha,
        parents: [...new Set([headRef.object.sha, baseRef.object.sha])],
        author: {
          name: 'Shubham Kanodia',
          email: 'shubham.kanodia10@gmail.com',
        },
      },
    }),
  )

  await api(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  })

  const remaining = pendingAdditions(baseCatalog, prunedCatalog)

  const metrics =
    remaining.length > 0
      ? await collectMetrics(remaining.map(entry => entry.package))
      : new Map<string, PendingPackageMetrics>()

  const rejected = [
    ...new Set([...previouslyRejected, ...removed.map(item => item.package)]),
  ]

  const nextOverview = renderPendingOverview(
    baseCatalog,
    prunedCatalog,
    metrics,
    rejected,
  )

  const nextBody = replaceOverview(body, nextOverview)

  await api(`/pulls/${prNumber}`, {
    method: 'PATCH',
    body: { body: nextBody },
  })

  await api('/actions/workflows/ci.yml/dispatches', {
    method: 'POST',
    body: { ref: branch },
  })

  const removedLines = removed.map(
    item => `- \`${item.package}\` (\`${item.slug}\`): ${item.reason}`,
  )

  const summaryNote =
    remaining.length > 0
      ? `Updated \`${catalogPath}\` with **${remaining.length}** remaining pending addition(s). Removed:\n${removedLines.join('\n')}`
      : `Removed all remaining pending additions from \`${catalogPath}\`:\n${removedLines.join('\n')}\n\nThey have been recorded as dismissed so future runs will not re-propose them.`

  await api(`/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body: summaryNote },
  })

  return {
    status: 'synced',
    removed: removed.map(item => item.package),
    remaining: remaining.map(item => item.package),
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = z
    .object({
      GITHUB_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      GITHUB_TOKEN: z.string().min(1),
      PR_NUMBER: z.coerce.number().int().positive(),
    })
    .parse(process.env)

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
      throw new Error(`GitHub ${method} ${path} failed`)
    }
  }

  console.log(
    await syncLibrarySelection({
      api,
      prNumber: env.PR_NUMBER,
    }),
  )
}
