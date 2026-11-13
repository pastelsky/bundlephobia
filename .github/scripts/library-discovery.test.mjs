import assert from 'node:assert/strict'
import test from 'node:test'
import {
  catalogPackages,
  dependencyNames,
  discoverLibraries,
  downloadSignals,
  isWebApplication,
  supportsBrowser,
  readState,
  rotate,
} from './library-discovery.mjs'

const catalog = { search: { similar: ['existing'] } }

const downloads = Array.from({ length: 56 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 8, 19 + i)).toISOString().slice(0, 10),
  downloads: i < 28 ? 100 : 200,
}))

const now = new Date('2026-11-14T12:00:00Z')

const limits = { seeds: 1, searchPages: 1, repositories: 3 }

function fakeSources() {
  const app = {
    private: true,
    scripts: { dev: 'vite' },
    devDependencies: { 'arbitrary-build-helper': '^1.0.0' },
    dependencies: {
      react: '^19.0.0',
      existing: '^1.0.0',
      fresh: '^1.0.0',
      pending: '^1.0.0',
    },
  }

  const server = {
    private: true,
    scripts: { dev: 'next dev' },
    dependencies: { react: '^19.0.0', 'server-only-package': '^1.0.0' },
  }

  const manifests = { root: app, backend: server }

  const github = async (route, args) => {
    if (route === 'GET /search/code')
      return {
        total_count: 3,
        items: ['alpha/app', 'beta/app', 'alpha/another-app'].map(repo => ({
          repository: { full_name: repo },
          path: 'package.json',
        })),
      }

    if (route === 'GET /search/repositories')
      return { total_count: 0, items: [] }

    if (route === 'GET /repos/{owner}/{repo}')
      return {
        fork: false,
        archived: false,
        stargazers_count: 1000,
        pushed_at: '2026-11-13T00:00:00Z',
        default_branch: 'main',
      }

    if (route === 'GET /repos/{owner}/{repo}/commits/{ref}')
      return { sha: 'pinned-commit' }

    if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}')
      return {
        truncated: false,
        tree: [
          { path: 'package.json', type: 'blob', sha: 'root' },
          { path: 'apps/backend/package.json', type: 'blob', sha: 'backend' },
        ],
      }

    if (route === 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}')
      return {
        size: 400,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(manifests[args.file_sha])).toString(
          'base64',
        ),
      }
    throw new Error(`Unexpected GitHub call: ${route}`)
  }

  const registry = async url => {
    if (url.includes('/downloads/range/')) return { downloads }
    const name = decodeURIComponent(url.split('/').at(-2))

    return {
      name,
      version: '1.0.0',
      description: name === 'eslint' ? 'ESLint tooling' : 'Browser utility',
      repository: `https://github.com/maintainer/${name}`,
    }
  }

  return { github, registry, excludedPackages: ['react'] }
}

test('registry aliases are normalized; workspaces and git references are excluded', () => {
  assert.deepEqual(
    [
      ...dependencyNames({
        dependencies: {
          alias: 'npm:actual-package@^1.0.0',
          local: 'workspace:*',
          github: 'github:owner/repo',
          react: '^19.0.0',
        },
        devDependencies: { browser: '^1.0.0' },
      }),
    ].sort(),
    ['actual-package', 'browser', 'react'],
  )
})

test('state corruption fails rather than silently allowing repeated discoveries', () => {
  assert.throws(() => readState({ version: 2, cursor: 0, surfaced: [] }))
  assert.throws(() =>
    readState({ version: 1, cursor: 0, surfaced: ['not a package'] }),
  )
  assert.deepEqual(rotate(['a', 'b', 'c'], 2, 2), ['c', 'a'])
  assert.deepEqual(
    catalogPackages({ a: { similar: ['b', 'a'] }, b: { similar: ['a'] } }),
    ['a', 'b'],
  )
})

test('web app manifests include browser libraries declared as development dependencies', () => {
  assert.equal(
    isWebApplication({
      private: true,
      devDependencies: { nuxt: '^4.0.0' },
      scripts: { build: 'nuxt build' },
    }),
    true,
  )
  assert.equal(
    isWebApplication({
      private: false,
      dependencies: { react: '^19.0.0' },
      scripts: { build: 'vite build' },
    }),
    false,
  )
})

test('two non-overlapping complete 28-day periods are required for download growth', () => {
  assert.deepEqual(downloadSignals(downloads), {
    previous28Days: 2800,
    last28Days: 5600,
    weeklyDownloads: 1400,
    downloadGrowth: 1,
  })
  assert.throws(() => downloadSignals(downloads.slice(1)))
})

test('catalog, pending and surfaced names are excluded; repeat collection yields no candidates', async () => {
  const sources = fakeSources()

  const result = await discoverLibraries({
    ...sources,
    catalog,
    pendingCatalog: { test: { similar: ['pending'] } },
    now,
    limits,
  })

  assert.deepEqual(
    result.report.candidates.map(candidate => candidate.package),
    ['fresh'],
    JSON.stringify(result.report),
  )
  assert.equal(result.report.candidates[0].consumers.length, 3)
  assert.match(
    result.report.candidates[0].consumers[0].manifest,
    /\/blob\/pinned-commit\/package.json$/,
  )
  assert.deepEqual(result.report.windows.npmDownloads, {
    start: '2026-09-19',
    end: '2026-11-13',
  })
  assert.deepEqual(result.state.surfaced, ['fresh'])

  const repeated = await discoverLibraries({
    ...sources,
    catalog,
    pendingCatalog: { test: { similar: ['pending'] } },
    state: result.state,
    now,
    limits,
  })

  assert.deepEqual(repeated.report.candidates, [])
})

test('multiple repositories under one owner do not establish independent consensus', async () => {
  const sources = fakeSources()
  const original = sources.github
  sources.github = (route, args) =>
    route === 'GET /search/code'
      ? Promise.resolve({
          total_count: 2,
          items: ['alpha/app', 'alpha/other'].map(repo => ({
            repository: { full_name: repo },
            path: 'package.json',
          })),
        })
      : original(route, args)
  const result = await discoverLibraries({ ...sources, catalog, now, limits })
  assert.deepEqual(result.report.candidates, [])
})

test('package author repositories are removed from consensus', async () => {
  const sources = fakeSources()

  const registry = async url =>
    url.includes('/downloads/')
      ? { downloads }
      : {
          name: decodeURIComponent(url.split('/').at(-2)),
          version: '1.0.0',
          repository: 'https://github.com/alpha/library',
        }

  const result = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(result.report.candidates, [])
})

test('unavailable optional code search falls back to topic discovery with explicit notes', async () => {
  const sources = fakeSources()
  const original = sources.github
  sources.github = (route, args) => {
    if (route === 'GET /search/code') throw new Error('HTTP 401')

    if (route === 'GET /search/repositories')
      return Promise.resolve({
        total_count: 2,
        items: [{ full_name: 'alpha/app' }, { full_name: 'beta/app' }],
      })

    return original(route, args)
  }

  const result = await discoverLibraries({ ...sources, catalog, now, limits })
  assert.ok(result.report.candidates.length > 0)
  assert.ok(result.report.notes.some(note => note.includes('HTTP 401')))
})

test('complete source failure does not return a state update', async () => {
  await assert.rejects(
    discoverLibraries({
      github: async () => {
        throw new Error('offline')
      },
      registry: async () => null,
      catalog,
      now,
      limits,
    }),
    /No discovery sources/,
  )
})

test('candidate delivery budgets do not consume unseen overflow', async () => {
  const sources = fakeSources()

  const first = await discoverLibraries({
    ...sources,
    catalog,
    now,
    limits: { ...limits, candidates: 1 },
  })

  assert.equal(first.report.candidates.length, 1)
  assert.equal(first.state.surfaced.length, 1)

  const next = await discoverLibraries({
    ...sources,
    catalog,
    state: first.state,
    now,
    limits: { ...limits, candidates: 1 },
  })

  assert.equal(next.report.candidates.length, 1)
  assert.notEqual(
    first.report.candidates[0].package,
    next.report.candidates[0].package,
  )
})

test('low usage and missing or deprecated npm identities do not become recommendations', async () => {
  const sources = fakeSources()

  for (const manifest of [
    { name: 'different-name' },
    { deprecated: 'retired' },
  ]) {
    const registry = async url => ({
      name: decodeURIComponent(url.split('/').at(-2)),
      ...manifest,
    })

    const result = await discoverLibraries({
      ...sources,
      registry,
      catalog,
      now,
      limits,
    })

    assert.deepEqual(result.report.candidates, [])
  }

  const registry = async url =>
    url.includes('/downloads/')
      ? { downloads: downloads.map(day => ({ ...day, downloads: 1 })) }
      : sources.registry(url)

  const low = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(low.report.candidates, [])
})

test('truncated trees and wrong download periods are explicit unavailable evidence', async () => {
  const sources = fakeSources()
  const original = sources.github

  const github = (route, args) =>
    route.includes('/git/trees/')
      ? Promise.resolve({ truncated: true, tree: [] })
      : original(route, args)

  const result = await discoverLibraries({
    ...sources,
    github,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(result.report.candidates, [])
  assert.ok(
    result.report.notes.some(note =>
      note.includes('Truncated repository tree'),
    ),
  )

  const registry = async url =>
    url.includes('/downloads/')
      ? {
          downloads: downloads.map((day, i) => ({
            ...day,
            day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
          })),
        }
      : sources.registry(url)

  const stale = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(stale.report.candidates, [])
  assert.ok(
    stale.report.notes.some(note => note.includes('different download window')),
  )
})

test('browser hints use published metadata rather than package-name lists', () => {
  assert.equal(supportsBrowser({ browser: './browser.js' }), true)
  assert.equal(
    supportsBrowser({ exports: { '.': { browser: './index.js' } } }),
    true,
  )
  assert.equal(supportsBrowser({ keywords: ['isomorphic'] }), true)
  assert.equal(supportsBrowser({}), false)
})

test('a batch includes one representative per upstream library repository', async () => {
  const sources = fakeSources()

  const registry = async url =>
    url.includes('/downloads/')
      ? { downloads }
      : {
          name: decodeURIComponent(url.split('/').at(-2)),
          version: '1.0.0',
          repository: 'https://github.com/maintainer/shared-library',
        }

  const result = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  assert.equal(result.report.candidates.length, 1)
  assert.equal(result.state.surfaced.length, 1)
})

test('dev-only declarations need a browser hint; the same package is eligible when runtime evidence appears', async () => {
  const sources = fakeSources()

  const registry = async url => {
    const manifest = await sources.registry(url)

    if (url.includes('arbitrary-build-helper/latest'))
      return { ...manifest, keywords: ['browser'] }

    return manifest
  }

  const result = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  const browserDev = result.report.candidates.find(
    candidate => candidate.package === 'arbitrary-build-helper',
  )

  assert.ok(browserDev)
  assert.equal(browserDev.runtimeConsumerCount, 0)
  assert.equal(browserDev.browserSupportHint, true)
})

test('exhausted npm throttling preserves the remaining unseen candidates for a later run', async () => {
  const sources = fakeSources()

  const registry = async () => {
    throw Object.assign(new Error('npm returned HTTP 429'), { status: 429 })
  }

  const result = await discoverLibraries({
    ...sources,
    registry,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(result.state.surfaced, [])
  assert.equal(result.report.coverage.packagesCheckedOnNpm, 1)
  assert.ok(
    result.report.notes.some(note =>
      note.includes('remaining packages deferred'),
    ),
  )
})
