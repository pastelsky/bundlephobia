import assert from 'node:assert/strict'
import test from 'node:test'
import { observeManifests } from '../manifests.mjs'
import { selectManifestPaths } from '../paths.mjs'

test('optional workspace links are followed once even with cycles', () => {
  const manifests = new Map([
    [
      'package.json',
      {
        private: true,
        scripts: { dev: 'vite' },
        optionalDependencies: { local: 'workspace:*' },
      },
    ],
    [
      'apps/local/package.json',
      {
        name: 'local',
        dependencies: { local: 'workspace:*', browser: '^1' },
      },
    ],
  ])

  const observed = observeManifests(manifests, {
    repo: 'owner/app',
    sha: 'commit',
    frameworks: [],
  })

  assert.deepEqual(
    observed.map(item => [item.package, item.runtime]),
    [['browser', true]],
  )
})

test('manifest selection excludes hidden, vendor and server paths before applying its budget', () => {
  const paths = [
    'package.json',
    'apps/web/package.json',
    'apps/site/package.json',
    ...[
      'node_modules',
      'vendor',
      'examples',
      'fixtures',
      'tests',
      'docs',
      'storybook',
      '.hidden',
      'backend',
    ].map(directory => `apps/${directory}/package.json`),
  ]

  const tree = { tree: paths.map(path => ({ path, type: 'blob', sha: path })) }
  const notes = []

  const selected = selectManifestPaths(
    tree,
    { repo: 'owner/app', paths: paths.slice(3) },
    { manifestsPerRepository: 2 },
    notes,
  )

  assert.deepEqual(
    selected.map(entry => entry.path),
    ['package.json', 'apps/site/package.json'],
  )
  assert.deepEqual(notes, ['Manifest budget reached: owner/app (2/3)'])
})
