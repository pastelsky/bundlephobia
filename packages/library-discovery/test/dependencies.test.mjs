import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dependencyNames,
  isWebApplication,
  supportsBrowser,
} from '../dependencies.mjs'
import { downloadSignals } from '../downloads.mjs'
import { downloads } from './fixtures.mjs'

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

test('browser hints use published metadata rather than package-name lists', () => {
  assert.equal(supportsBrowser({ browser: './browser.js' }), true)
  assert.equal(
    supportsBrowser({ exports: { '.': { browser: './index.js' } } }),
    true,
  )
  assert.equal(supportsBrowser({ keywords: ['isomorphic'] }), true)
  assert.equal(supportsBrowser({}), false)
})
