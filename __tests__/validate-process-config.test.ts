import { spawn } from 'node:child_process'

import {
  parseProcessApps,
  validateProcessConfig,
  validateProcessContents,
} from '../scripts/validate-process-config'

test('all PM2 process entrypoints exist and TypeScript services are runnable by Node', () => {
  const result = validateProcessConfig()

  expect(result.errors).toEqual([])
  expect(result.apps.map(app => app.name)).toEqual([
    'main',
    'build-service',
    'cache-service',
  ])
})

test('cache-service PM2 command starts the configured listener', async () => {
  const result = validateProcessConfig()
  const app = result.apps.find(candidate => candidate.name === 'cache-service')
  expect(app).toBeDefined()

  const child = spawn(process.execPath, [...app!.nodeArgs, app!.script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await new Promise<void>((resolve, reject) => {
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

  expect(apps[0].script).toBe('./service.ts')
  expect(apps[0].nodeArgs).toEqual(['--experimental-strip-types'])
  expect(apps[0].block).toMatch(/name: service/)
  expect(apps[0].block).not.toMatch(/name: other/)
  expect(apps[1].script).toBe('./other.js')
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

  expect(result.errors[0]).toMatch(/missing script/)
  expect(result.errors[1]).toMatch(/without --experimental-strip-types/)
})
