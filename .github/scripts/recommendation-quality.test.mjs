import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectPackageSignals,
  evaluateRecommendation,
  evaluateSizeAdvantage,
  extractCuratedCategories,
  extractCuratedRecommendations,
  extractGitHubRepository,
  extractIssueFormAnswers,
  isPlausiblePackageName,
  normalizePackageName,
  parsePackageNames,
} from './recommendation-quality.mjs'

test('extracts required answers from a GitHub issue form body', () => {
  const answers = extractIssueFormAnswers(`### npm package name

date-fns

### Package category name

General purpose date-time utilities

### Alternative npm packages

moment

### Why is this a better alternative?

It is modular and tree-shakeable, reducing the shipped JavaScript for common tasks.

### Your relationship to the package

I am a user of the package`)

  assert.equal(answers.packageName, 'date-fns')
  assert.equal(answers.alternative, 'moment')
  assert.match(answers.advantage, /tree-shakeable/)
})

test('parses unique comma and newline separated comparison packages', () => {
  assert.deepEqual(parsePackageNames('moment, luxon\n`date-fns`, moment'), [
    'moment',
    'luxon',
    'date-fns',
  ])
})

test('extracts package details from legacy recommendation issues', () => {
  const answers = extractIssueFormAnswers(`**Package name**

@milkdown/core

**Alternative to**

@tiptap/core, quill

<!-- Name popular package(s) this package is an alternative to. -->

**Quality check**`)

  assert.equal(answers.packageName, '@milkdown/core')
  assert.equal(answers.alternative, '@tiptap/core, quill')
})

test('normalizes common package-name inputs and rejects prose', () => {
  assert.equal(normalizePackageName('`@scope/package`'), '@scope/package')
  assert.equal(
    normalizePackageName('https://www.npmjs.com/package/@scope/package'),
    '@scope/package'
  )
  assert.equal(
    normalizePackageName('[date-fns](https://npmjs.com/package/date-fns)'),
    'date-fns'
  )
  assert.equal(isPlausiblePackageName('@scope/package'), true)
  assert.equal(isPlausiblePackageName('date fns'), false)
})

test('extracts GitHub repositories from npm metadata', () => {
  assert.equal(
    extractGitHubRepository('git+https://github.com/date-fns/date-fns.git'),
    'date-fns/date-fns'
  )
  assert.equal(
    extractGitHubRepository({ url: 'git://github.com/user/project.git' }),
    'user/project'
  )
})

test('collects objective npm and GitHub quality signals', async () => {
  const responses = new Map([
    [
      'https://registry.npmjs.org/example-package',
      {
        'dist-tags': { latest: '2.0.0' },
        time: { '2.0.0': '2026-01-01T00:00:00.000Z' },
        versions: {
          '2.0.0': {
            repository: 'https://github.com/example/package.git',
          },
        },
      },
    ],
    [
      'https://api.npmjs.org/downloads/point/last-week/example-package',
      { downloads: 2_500 },
    ],
    [
      'https://api.github.com/repos/example/package',
      {
        stargazers_count: 250,
        archived: false,
        pushed_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    [
      'https://bundlephobia.com/api/size?package=example-package',
      { version: '2.0.0', size: 5_000, gzip: 2_000 },
    ],
  ])
  const fetchImpl = async url => ({
    ok: responses.has(url),
    status: responses.has(url) ? 200 : 404,
    json: async () => responses.get(url),
  })

  const signals = await collectPackageSignals('example-package', {
    fetchImpl,
    githubToken: 'test-token',
  })

  assert.equal(signals.exists, true)
  assert.equal(signals.popular, true)
  assert.equal(signals.activeOrStable, true)
  assert.equal(signals.repository, 'example/package')
  assert.equal(signals.bundleSize.gzip, 2_000)
})

test('blocks authoritative failures but keeps incomplete signals advisory', () => {
  const missing = evaluateRecommendation({ exists: false }, { advantage: '' })
  assert.equal(missing.status, 'invalid')
  assert.equal(missing.errors.length, 1)

  const incomplete = evaluateRecommendation(
    {
      exists: true,
      deprecated: false,
      repositoryArchived: false,
      popular: false,
      activeOrStable: true,
    },
    {
      advantage: 'Smaller',
    }
  )
  assert.equal(incomplete.status, 'needs review')
  assert.equal(incomplete.errors.length, 0)

  const unavailable = evaluateRecommendation({ exists: null })
  assert.equal(unavailable.status, 'needs review')
  assert.equal(unavailable.errors.length, 0)
})

test('treats an npm registry outage as unavailable, not missing', async () => {
  const signals = await collectPackageSignals('example-package', {
    fetchImpl: async () => {
      throw new Error('network unavailable')
    },
  })

  assert.equal(signals.exists, null)
  assert.equal(evaluateRecommendation(signals).errors.length, 0)
})

test('extracts package names only from curated similar arrays', () => {
  const source = `const categories = {
    example: {
      name: 'Example package in a title',
      tags: [{ tag: 'not-a-recommendation', weight: 5 }],
      similar: ['one-package', '@scope/two-package'],
    },
  }`

  assert.deepEqual(
    [...extractCuratedRecommendations(source)],
    ['one-package', '@scope/two-package']
  )
})

test('extracts categories and their curated package lists', () => {
  const source = `const categories = {
  'date-time': {
    name: 'Date and time',
    tags: [{ tag: 'date', weight: 5 }],
    similar: ['moment', 'date-fns'],
  },
  storage: {
    name: 'Storage',
    tags: [],
    similar: [
      'localforage',
      'idb',
    ],
  },
}`
  const categories = extractCuratedCategories(source)

  assert.deepEqual(
    [...categories.get('date-time').packages],
    ['moment', 'date-fns']
  )
  assert.equal(categories.get('storage').name, 'Storage')
})

test('summarizes size evidence without turning it into a gate', () => {
  const candidate = {
    packageName: 'small',
    bundleSize: { available: true, gzip: 1_000 },
  }
  const alternatives = [
    {
      packageName: 'large',
      bundleSize: { available: true, gzip: 5_000 },
    },
    {
      packageName: 'tiny',
      bundleSize: { available: true, gzip: 500 },
    },
  ]

  const result = evaluateSizeAdvantage(candidate, alternatives)
  assert.equal(result.available, true)
  assert.deepEqual(result.smallerThan, ['large'])
})
