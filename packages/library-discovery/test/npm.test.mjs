import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverLibraries } from '../index.mjs'
import {
  eligibleCandidates,
  selectCandidates,
  downloadSignals,
  supportsBrowser,
} from '../npm.mjs'
import { catalog, downloads, now, limits, fakeSources } from './fixtures.mjs'

test('two non-overlapping complete 28-day periods are required for download growth', () => {
  assert.deepEqual(downloadSignals(downloads), {
    previous28Days: 2800,
    last28Days: 5600,
    weeklyDownloads: 1400,
    downloadGrowth: 1,
  })
  assert.throws(() => downloadSignals(downloads.slice(1)))
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

test('duplicate manifests count once per repo and retain runtime evidence', () => {
  const runtime = {
    package: 'browser',
    repo: 'alpha/app',
    owner: 'alpha',
    runtime: true,
  }

  const dev = { ...runtime, runtime: false }
  const other = { ...dev, repo: 'beta/app', owner: 'beta' }

  const [candidate] = eligibleCandidates(
    [dev, runtime, dev, other],
    new Set(),
    2,
  )

  assert.deepEqual(candidate.consumers, [runtime, other])
  assert.equal(candidate.ownerCount, 2)
  assert.equal(candidate.runtimeOwnerCount, 1)
})

test('candidate selection keeps the highest-ranked upstream representative and respects zero budget', () => {
  const candidates = [
    { package: 'older', upstream: 'shared', downloadGrowth: 0 },
    { package: 'rising', upstream: 'shared', downloadGrowth: 1 },
  ]

  assert.deepEqual(
    selectCandidates(candidates, 2).map(item => item.package),
    ['rising'],
  )
  assert.deepEqual(selectCandidates(candidates, 0), [])
})
