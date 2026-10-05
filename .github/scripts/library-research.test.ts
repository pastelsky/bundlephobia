import assert from 'node:assert/strict'
import { z } from 'zod'
import {
  catalogSchema,
  type Catalog,
} from '@bundlephobia/service-contracts/recommendations'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { request } from '@octokit/request'
import {
  branch,
  catalogPath,
  carryPending,
  mergeProposal,
  publishResearch,
  verifyPackages,
  type GitHubApi,
  type Proposal,
} from './library-research.ts'

const item = (name: string) => ({
  package: name,
  repository: `owner/${name}`,
  reason:
    'A compatible alternative for the same concrete task, with a simpler API for applications that do not need plugins.',
  tradeoffs:
    'Fewer integrations; consumers still need to verify the runtime and migration costs.',
  sources: [
    `https://github.com/owner/${name}`,
    `https://news.ycombinator.com/item?id=${name}`,
  ],
})

const proposal = (...names: string[]): Proposal => [
  {
    slug: 'example',
    name: 'Example utilities',
    tags: [{ tag: 'example', weight: 7 }],
    reason:
      'These packages perform the same concrete application task in the same runtime, not just matching broad tags.',
    recommendations: names.map(item),
  },
]

const baseline = {
  example: {
    name: 'Example utilities',
    tags: [{ tag: 'example', weight: 7 }],
    similar: ['original'],
  },
}

test('first-run publication preserves the branch filter through the real GitHub transport', async () => {
  const { api: fixture } = github()

  const client = request.defaults({
    request: {
      fetch: async (
        input: Parameters<typeof fetch>[0],
        options?: RequestInit,
      ) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        )

        assert.equal(url.hostname, 'api.github.com')
        assert.equal(options?.method, 'GET')

        if (url.pathname.endsWith('/pulls')) {
          assert.equal(url.searchParams.get('head'), `owner:${branch}`)
          assert.equal(url.searchParams.get('state'), 'all')
        }

        return Response.json(
          await fixture(
            url.pathname.replace('/repos/owner/repo', '') + url.search,
          ),
        )
      },
    },
  })

  const result = await publishResearch({
    api: async path =>
      (
        await client({
          method: 'GET',
          url: `/repos/owner/repo${path}`,
          data: undefined,
        })
      ).data,
    proposal: [],
  })

  assert.deepEqual(result, { status: 'no changes' })
})

test('cumulative proposals preserve approved and pending packages; repeated discovery is a no-op', () => {
  const first = mergeProposal(baseline, proposal('candidate'))
  const second = mergeProposal(first, proposal('another'))
  assert.deepEqual(second.example.similar, ['original', 'candidate', 'another'])
  assert.deepEqual(mergeProposal(second, proposal('candidate')), second)
  assert.equal(
    second.example.research!.recommendations.candidate.reason,
    item('candidate').reason,
  )
  assert.deepEqual(mergeProposal({}, proposal('one', 'two')).example.similar, [
    'one',
    'two',
  ])
})

test('rejects unsupported groups, weak evidence, invalid identities and oversized catalogs', () => {
  assert.throws(() => mergeProposal({}, proposal('one')), /two to six/)
  assert.throws(
    () => mergeProposal(baseline, proposal('a', 'b', 'c', 'd', 'e', 'f')),
    /two to six/,
  )

  for (const patch of [
    { package: '../bad' },
    { sources: ['https://github.com/owner/one', 'http://localhost/'] },
    { reason: 'hype' },
    { repository: 'different/repo' },
  ]) {
    const p = proposal('one', 'two')
    Object.assign(p[0].recommendations[0], patch)
    assert.throws(() => mergeProposal({}, p))
  }
})

test('fails closed on npm identity/deprecation, registry failure or archived source; never calls size APIs', async () => {
  const urls: string[] = []
  await verifyPackages(
    proposal('candidate'),
    async (url, options) => {
      urls.push(url)

      assert.equal(
        new Headers(options?.headers).get('Authorization'),
        url.includes('api.github.com') ? 'Bearer test-token' : null,
      )

      return {
        ok: true,
        json: async () =>
          url.includes('registry.npmjs.org')
            ? {
                name: 'candidate',
                repository: 'https://github.com/owner/candidate',
              }
            : { archived: false },
      }
    },
    'test-token',
  )
  assert.equal(urls.length, 2)
  assert.ok(urls.every(url => !url.includes('bundlephobia')))

  for (const manifest of [
    { name: 'other' },
    { name: 'candidate', deprecated: 'use another' },
    { name: 'candidate', repository: 'https://github.com/other/repo' },
  ]) {
    await assert.rejects(
      verifyPackages(proposal('candidate'), async () => ({
        ok: true,
        json: async () => manifest,
      })),
    )
  }

  await assert.rejects(
    verifyPackages(proposal('candidate'), async () => ({
      ok: false,
      status: 503,
      json: async () => null,
    })),
  )
  await assert.rejects(
    verifyPackages(proposal('candidate'), async url => ({
      ok: true,
      json: async () =>
        url.includes('registry.npmjs.org')
          ? {
              name: 'candidate',
              repository: 'https://github.com/owner/candidate',
            }
          : { archived: true },
    })),
    /archived/,
  )
})

test('three-way carry retains new approved categories and stops on overlapping maintainer edits', () => {
  const pending = mergeProposal(baseline, proposal('candidate'))

  const latest = {
    ...baseline,
    new: { name: 'Approved', tags: [], similar: ['safe'] },
  }

  assert.deepEqual(carryPending(latest, baseline, pending), {
    ...pending,
    new: latest.new,
  })
  assert.throws(
    () =>
      carryPending(
        mergeProposal(baseline, proposal('human')),
        baseline,
        pending,
      ),
    /resolution/,
  )
})

function github() {
  type PullRequest = {
    number: number
    state: 'open' | 'closed'
    merged_at?: string | null
    base: { ref: string }
    html_url: string
    body: string
  }

  type MockState = {
    head: string | null
    catalogs: Record<string, Catalog>
    prs: PullRequest[]
    writes: Array<{ path: string; method: string; body: unknown }>
    blobs: Record<string, Catalog>
    trees: Record<string, Catalog>
    next: number
  }

  const state: MockState = {
    head: null,
    catalogs: { base: baseline },
    prs: [],
    writes: [],
    blobs: {},
    trees: {},
    next: 0,
  }

  const api: GitHubApi = async (path, options = {}) => {
    const { body, method = 'GET' } = options

    if (method !== 'GET') state.writes.push({ path, method, body })

    if (path === '')
      return { default_branch: 'bundlephobia', owner: { login: 'owner' } }

    if (path === '/git/ref/heads/bundlephobia')
      return { object: { sha: 'base' } }

    if (path === `/git/ref/heads/${branch}`)
      return state.head ? { object: { sha: state.head } } : null

    if (path.startsWith('/pulls?')) return state.prs

    if (path.startsWith('/contents/'))
      return {
        content: Buffer.from(
          JSON.stringify(state.catalogs[path.split('ref=')[1]]),
        ).toString('base64'),
      }

    if (path.startsWith('/compare/'))
      return {
        merge_base_commit: { sha: 'base' },
        files: [{ filename: catalogPath }],
      }

    if (path === '/git/commits/base') return { tree: { sha: 'base-tree' } }

    if (path === '/git/blobs') {
      const sha = `blob${++state.next}`
      state.blobs[sha] = catalogSchema.parse(
        JSON.parse(z.string().parse(body?.content)),
      )

      return { sha }
    }

    if (path === '/git/trees') {
      assert.deepEqual(
        z
          .array(z.object({ path: z.string(), sha: z.string() }))
          .parse(body?.tree)
          .map(file => file.path),
        [catalogPath],
      )
      const sha = `tree${++state.next}`
      state.trees[sha] =
        state.blobs[
          z.array(z.object({ sha: z.string() })).parse(body?.tree)[0].sha
        ]

      return { sha }
    }

    if (path === '/git/commits') {
      const sha = `commit${++state.next}`
      state.catalogs[sha] = state.trees[z.string().parse(body?.tree)]

      return { sha }
    }

    if (path === '/git/refs' || path.startsWith('/git/refs/heads/')) {
      assert.notEqual(body?.force, true)
      state.head = z.string().parse(body?.sha)

      return {}
    }

    if (path === '/pulls') {
      const pr: PullRequest = {
        body: z.string().parse(body?.body),
        number: 1,
        state: 'open',
        base: { ref: z.string().parse(body?.base) },
        html_url: 'https://github.com/owner/repo/pull/1',
      }

      state.prs = [pr]

      return pr
    }

    if (path === '/pulls/1') {
      Object.assign(state.prs[0], body)

      return state.prs[0]
    }

    if (path === '/actions/workflows/ci.yml/dispatches') return null
    throw new Error(`Unexpected API ${path}`)
  }

  return { state, api }
}

test('publishes only one branch/PR, accumulates evidence, preserves human PR text and dispatches CI', async () => {
  const { state, api } = github()

  const run = (p: Proposal) =>
    publishResearch({
      api,
      proposal: p,
      verify: async () => {},
      runUrl: 'https://github.com/owner/repo/actions/runs/1',
    })

  await run(proposal('candidate'))
  state.prs[0].body = `Human review notes\n${state.prs[0].body}`
  await run(proposal('another'))
  assert.equal(
    state.writes.filter(write => write.path === '/git/refs').length,
    1,
  )
  assert.equal(state.writes.filter(write => write.path === '/pulls').length, 1)
  assert.deepEqual(state.catalogs[state.head!].example.similar, [
    'original',
    'candidate',
    'another',
  ])
  assert.match(state.prs[0].body, /Human review notes/)
  assert.match(state.prs[0].body, /candidate/)
  assert.match(state.prs[0].body, /another/)
  assert.equal(
    state.writes.filter(write => write.path.includes('/dispatches')).length,
    2,
  )
  const count = state.writes.length
  await run(proposal('candidate'))
  assert.equal(state.writes.length, count + 1) // Refresh only the managed PR summary.
})

test('a rejected PR blocks publication, and failed identity checks create no branch', async () => {
  const { state, api } = github()
  state.prs = [
    {
      number: 1,
      state: 'closed',
      merged_at: null,
      base: { ref: 'bundlephobia' },
      html_url: 'https://github.com/owner/repo/pull/1',
      body: '',
    },
  ]
  await assert.rejects(
    publishResearch({ api, proposal: proposal('candidate') }),
    /rejected/,
  )
  assert.equal(state.writes.length, 0)
  state.prs = []
  await assert.rejects(
    publishResearch({
      api,
      proposal: proposal('candidate'),
      verify: async () => {
        throw new Error('invalid identity')
      },
    }),
    /invalid identity/,
  )
  assert.equal(state.writes.length, 0)
})

test('reuses the same branch after merge, without losing approved recommendations', async () => {
  const { state, api } = github()

  const run = (p: Proposal) =>
    publishResearch({
      api,
      proposal: p,
      verify: async () => {},
      runUrl: 'https://github.com/owner/repo/actions/runs/1',
    })

  await run(proposal('candidate'))
  state.catalogs.base = state.catalogs[state.head!]
  state.prs[0].state = 'closed'
  state.prs[0].merged_at = '2026-10-05T00:00:00Z'
  await run(proposal('another'))
  assert.deepEqual(state.catalogs[state.head!].example.similar, [
    'original',
    'candidate',
    'another',
  ])
  assert.equal(
    state.writes.filter(write => write.path === '/git/refs').length,
    1,
  )
  assert.equal(state.writes.filter(write => write.path === '/pulls').length, 2)
  assert.doesNotMatch(state.prs[0].body, /#### candidate/)
  assert.match(state.prs[0].body, /#### another/)
})

test('refuses a branch containing code changes and never overwrites concurrent edits', async () => {
  const { state, api } = github()

  const options = {
    verify: async () => {},
    runUrl: 'https://github.com/owner/repo/actions/runs/1',
  }

  await publishResearch({ ...options, api, proposal: proposal('candidate') })
  state.writes = []
  await assert.rejects(
    publishResearch({
      ...options,
      proposal: proposal('another'),
      api: async (path, params) =>
        path.startsWith('/compare/')
          ? {
              files: [{ filename: 'package.json' }],
              merge_base_commit: { sha: 'base' },
            }
          : api(path, params),
    }),
    /non-catalog/,
  )
  assert.equal(state.writes.length, 0)
  let reads = 0
  await assert.rejects(
    publishResearch({
      ...options,
      proposal: proposal('another'),
      api: async (path, params) => {
        if (path === `/git/ref/heads/${branch}` && ++reads === 2)
          return { object: { sha: 'maintainer-edit' } }

        return api(path, params)
      },
    }),
    /changed during publishing/,
  )
  assert.ok(
    !state.writes.some(
      write =>
        write.path.startsWith('/git/refs') || write.path.startsWith('/pulls'),
    ),
  )
})

test('the shared catalog retains the existing category contract', async () => {
  const catalog = catalogSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../../utils/similar-packages.catalog.json', import.meta.url),
        'utf8',
      ),
    ),
  )

  assert.ok(Object.keys(catalog).length > 20)

  const exported = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-r',
        'esbuild-register',
        '-e',
        'console.log(JSON.stringify(require("./utils/similarPackages")))',
      ],
      { encoding: 'utf8', cwd: new URL('../../', import.meta.url) },
    ),
  )

  assert.deepEqual(exported.categories, catalog)
  assert.ok(exported.comparisonGroups.length > 0)

  for (const category of Object.values(catalog)) {
    assert.ok(category.name.trim().length > 0)
    assert.ok(category.similar.length <= 6)
    assert.ok(category.tags.every(tag => Number.isInteger(tag.weight)))
  }
})
