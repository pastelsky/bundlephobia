import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectPackageSignals,
  evaluateRecommendation,
  extractCuratedRecommendations,
  extractGitHubRepository,
  extractIssueFormAnswers,
  isPlausiblePackageName,
  normalizePackageName,
} from './recommendation-quality.mjs'

test('extracts required answers from a GitHub issue form body', () => {
  const answers = extractIssueFormAnswers(`### npm package name

date-fns

### Alternative package or category

moment

### Functional overlap

Both packages parse, format, and manipulate dates in browser applications.

### Why is this a better alternative?

It is modular and tree-shakeable, reducing the shipped JavaScript for common tasks.

### Your relationship to the package

I am a user of the package`)

  assert.equal(answers.packageName, 'date-fns')
  assert.equal(answers.alternative, 'moment')
  assert.match(answers.advantage, /tree-shakeable/)
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
  assert.equal(signals.popularityPass, true)
  assert.equal(signals.maintenancePass, true)
  assert.equal(signals.repository, 'example/package')
})

test('classifies missing packages as invalid and thin claims as needing evidence', () => {
  assert.equal(
    evaluateRecommendation({ exists: false }, { overlap: '', advantage: '' })
      .status,
    'invalid'
  )

  assert.equal(
    evaluateRecommendation(
      {
        exists: true,
        deprecated: false,
        repositoryArchived: false,
        popularityPass: false,
        maintenancePass: true,
      },
      {
        overlap: 'Same thing',
        advantage: 'Smaller',
      }
    ).status,
    'needs evidence'
  )
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
