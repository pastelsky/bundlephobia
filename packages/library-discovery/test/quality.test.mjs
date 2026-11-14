import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverLibraries } from '../index.mjs'
import { eligibleCandidates } from '../candidates.mjs'
import { catalog, downloads, now, limits, fakeSources } from './fixtures.mjs'

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
