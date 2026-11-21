import assert from 'node:assert/strict'
import test from 'node:test'
import {
  discoverLibraries,
  readState,
  catalogPackages,
  rankCandidates,
} from '../index.mjs'
import { rotate, discoverHackerNewsStories } from '../search.mjs'
import { catalog, now, limits, fakeSources } from './fixtures.mjs'

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
  assert.equal(result.report.windows.repositoryActivitySince, '2026-08-16')
  assert.equal(result.report.candidates[0].consumers[0].stars, 1000)
  assert.equal(result.report.candidates[0].authorityScore, 2 * Math.log2(1001))
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
      catalog,
      now,
      limits,
    }),
    /No discovery sources/,
  )
})

test('truncated trees are explicit unavailable evidence', async () => {
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
})

test('authority uses the strongest repo per owner and requires two owners regardless of stars', () => {
  const observation = (name, repo, stars, runtime = true) => ({
    package: name,
    repo,
    owner: repo.split('/')[0],
    stars,
    runtime,
  })

  const strong = observation('strong', 'alpha/app', 100000)

  const ranked = rankCandidates(
    [
      strong,
      { ...strong, runtime: false },
      observation('strong', 'alpha/other', 1000),
      observation('strong', 'beta/app', 100),
      observation('modest', 'alpha/app', 1000),
      observation('modest', 'beta/app', 1000),
      observation('one-owner', 'alpha/app', 1000000),
      observation('one-owner', 'alpha/other', 1000000),
      observation('dev-only', 'alpha/app', 1000000, false),
      observation('dev-only', 'beta/app', 1000000, false),
    ],
    new Set(),
    2,
  )

  assert.deepEqual(
    ranked.map(item => item.package),
    ['strong', 'modest'],
  )
  assert.equal(ranked[0].authorityScore, Math.log2(100001) + Math.log2(101))
  assert.equal(ranked[0].ownerCount, 2)
  assert.deepEqual(ranked[0].consumers[0], strong)
})

test('invalid star metadata is unavailable evidence rather than a non-finite score', async () => {
  const sources = fakeSources()

  const github = async (route, args) => {
    const result = await sources.github(route, args)

    return route === 'GET /repos/{owner}/{repo}'
      ? { ...result, stargazers_count: null }
      : result
  }

  const { report } = await discoverLibraries({
    ...sources,
    github,
    catalog,
    now,
    limits,
  })

  assert.deepEqual(report.candidates, [])
  assert.ok(
    report.notes.some(note => note.includes('Invalid repository star count')),
  )
})

test('a zero delivery budget leaves every candidate unsurfaced', async () => {
  const result = await discoverLibraries({
    ...fakeSources(),
    catalog,
    now,
    limits: { ...limits, candidates: 0 },
  })

  assert.deepEqual(result.report.candidates, [])
  assert.deepEqual(result.state.surfaced, [])
})

test('ranking excludes @types packages and caps packages per scope', () => {
  const observation = (name, repo, stars = 1000) => ({
    package: name,
    repo,
    owner: repo.split('/')[0],
    stars,
    runtime: true,
  })

  const ranked = rankCandidates(
    [
      observation('@types/node', 'a/app', 10000),
      observation('@types/node', 'b/app', 10000),
      observation('@scope/one', 'a/app', 5000),
      observation('@scope/one', 'b/app', 5000),
      observation('@scope/two', 'a/app', 4000),
      observation('@scope/two', 'b/app', 4000),
      observation('@scope/three', 'a/app', 3000),
      observation('@scope/three', 'b/app', 3000),
      observation('standalone', 'a/app', 2000),
      observation('standalone', 'b/app', 2000),
    ],
    new Set(),
    2,
  )

  assert.deepEqual(
    ranked.map(item => item.package),
    ['@scope/one', '@scope/two', 'standalone'],
  )
})

test('hacker news discovery queries non-Show-HN stories, deduplicates, and sorts by points', async () => {
  const urls = []
  const notes = []

  const stories = await discoverHackerNewsStories(
    async url => {
      urls.push(url)

      return {
        ok: true,
        json: async () => ({
          hits: [
            {
              objectID: '1',
              title: 'Orama 3.0',
              url: 'https://orama.com',
              points: 180,
              num_comments: 40,
              created_at: '2026-11-10T00:00:00Z',
            },
            {
              objectID: '2',
              title: 'Show HN: Tiny DOM Helper',
              url: 'https://example.com',
              points: 60,
              num_comments: 12,
              created_at: '2026-11-12T00:00:00Z',
            },
          ],
        }),
      }
    },
    { now, notes },
  )

  assert.equal(urls.length, 7)
  assert.ok(
    urls.every(
      url =>
        url.includes('tags=story') &&
        !url.includes('Show') &&
        !url.includes('+OR+'),
    ),
  )
  assert.deepEqual(
    stories.map(story => story.title),
    ['Orama 3.0', 'Show HN: Tiny DOM Helper'],
  )
  assert.deepEqual(notes, [])
})
