import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

import {
  parseProcessApps,
  validateProcessConfig,
  validateProcessContents,
} from './validate-process-config.mjs'

test('all PM2 process entrypoints exist and TypeScript services are runnable by Node', () => {
  const result = validateProcessConfig()

  assert.deepEqual(result.errors, [])
  assert.deepEqual(
    result.apps.map(app => app.name),
    ['main', 'build-service', 'cache-service'],
  )
})

test('cache-service PM2 command starts the configured listener', async () => {
  const result = validateProcessConfig()
  const app = result.apps.find(candidate => candidate.name === 'cache-service')
  assert.ok(app)

  const child = spawn(process.execPath, [...app.nodeArgs, app.script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('cache-service did not start')),
        5000,
      )
      let output = ''
      child.stdout.on('data', chunk => {
        output += chunk.toString()
        if (output.includes('server listening on 7001')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timeout)
        reject(
          new Error(
            `cache-service exited before listening (${code}): ${output}`,
          ),
        )
      })
    })
  } finally {
    child.kill('SIGTERM')
  }
})

test('process parser keeps each app block attached to its script', () => {
  const apps = parseProcessApps(`
  - script: ./service.ts
    name: service
    node_args:
      - --experimental-strip-types
  - script: ./other.js
    name: other
`)

  assert.equal(apps[0].script, './service.ts')
  assert.deepEqual(apps[0].nodeArgs, ['--experimental-strip-types'])
  assert.match(apps[0].block, /name: service/)
  assert.doesNotMatch(apps[0].block, /name: other/)
  assert.equal(apps[1].script, './other.js')
})

test('validator rejects missing scripts and TypeScript without a runtime loader', () => {
  const result = validateProcessContents(
    `
  - script: ./missing.js
    name: missing
  - script: ./cache-service/index.ts
    name: cache-service
`,
    process.cwd(),
  )

  assert.match(result.errors[0], /missing script/)
  assert.match(result.errors[1], /without --experimental-strip-types/)
})
