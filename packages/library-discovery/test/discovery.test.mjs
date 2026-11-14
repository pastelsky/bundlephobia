import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverLibraries, readState, catalogPackages } from '../index.mjs'
import { rotate } from '../search.mjs'
import { catalog, downloads, now, limits, fakeSources } from './fixtures.mjs'

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
