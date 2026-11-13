import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverLibraries } from '../index.mjs'
import { catalog, downloads, now, limits, fakeSources } from './fixtures.mjs'

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
