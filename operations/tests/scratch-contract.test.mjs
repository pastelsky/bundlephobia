import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { watch } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { scratchPolicy } from '../cleanup-scratch.mjs'

const root = process.env.BUILD_TMP_DIR

const marker = '.bundlephobia-disposable'

const worker = new URL('./build-scratch-worker.mjs', import.meta.url)

const cleaner = new URL('../cleanup-scratch.mjs', import.meta.url)

function runWorker(scenario, client) {
  const result = spawnSync(process.execPath, [worker.pathname, scenario], {
    env: { ...process.env, SCRATCH_CLIENT: client },
    stdio: 'inherit',
    timeout: 60_000,
  })

  if (result.error) throw result.error

  if (scenario === 'crash') assert.equal(result.signal, 'SIGKILL')
  else assert.equal(result.status, 0, `${client} ${scenario} failed`)
}

function clean(all = false) {
  const result = spawnSync(
    process.execPath,
    [cleaner.pathname, '--root', root, ...(all ? ['--all'] : [])],
    {
      stdio: 'inherit',
      timeout: 30_000,
    },
  )

  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Actual scratch cleaner failed')
}

async function children(directory) {
  return fs.readdir(directory).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
}

async function assertNoWorkspaces() {
  assert.deepEqual(
    await children(path.join(root, 'packages')),
    [],
    'Completed workspaces leaked',
  )
}

async function exerciseClients() {
  for (const client of ['npm', 'bun']) {
    for (const scenario of ['success', 'failure', 'cancel']) {
      runWorker(scenario, client)
      await assertNoWorkspaces()
    }
  }

  runWorker('crash', 'bun')
  const abandoned = await children(path.join(root, 'packages'))
  assert.ok(
    abandoned.length > 0,
    'SIGKILL must leave actual generated workspaces for recovery',
  )

  return abandoned
}

async function exercisePressureCleanup(abandoned) {
  const old = new Date(Date.now() - 2 * 60 * 60_000)
  await Promise.all(
    abandoned.map(name =>
      fs.utimes(path.join(root, 'packages', name), old, old),
    ),
  )
  const young = path.join(root, 'packages', 'live-sentinel')
  await fs.mkdir(young)
  const shared = await children(path.join(root, 'installations'))
  assert.ok(shared.length > 0)
  // Fill the small tmpfs enough to exercise the unmodified 60% production trigger.
  await fs.writeFile(
    path.join(root, 'cache', 'pressure'),
    Buffer.alloc(80 * 1024 * 1024),
  )
  clean()
  assert.deepEqual(await children(path.join(root, 'packages')), [
    'live-sentinel',
  ])
  assert.deepEqual(
    await children(path.join(root, 'installations')),
    shared,
    'Host cleanup touched shared leases',
  )
}

test(
  'real build writes stay approved and the production cleaner reclaims their abandoned output',
  { timeout: 120_000 },
  async () => {
    assert.ok(root, 'BUILD_TMP_DIR must name the isolated test root')
    assert.equal(
      Number((await fs.statfs(root)).type),
      0x01021994,
      'Run on the isolated Linux tmpfs',
    )
    await fs.mkdir(path.join(root, 'cache', 'tmp'), { recursive: true })
    await fs.mkdir(path.join(root, 'cache', 'home'), { recursive: true })
    const unexpected = new Set()

    const observer = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const name = filename.toString().split(path.sep)[0]

      if (!Object.hasOwn(scratchPolicy, name) && name !== marker)
        unexpected.add(name)
    })

    try {
      const abandoned = await exerciseClients()
      const present = await children(root)
      assert.deepEqual(
        present.sort(),
        Object.keys(scratchPolicy).sort(),
        'Unapproved output root or missing real scenario coverage',
      )
      await exercisePressureCleanup(abandoned)
      await fs.writeFile(
        path.join(root, marker),
        JSON.stringify({ ownerPid: process.pid, purpose: 'cleanup-contract' }),
      )
      clean(true)
      await delay(50)
      assert.deepEqual(
        [...unexpected],
        [],
        'Even transient writes must use an approved root',
      )
      assert.deepEqual(
        await children(root),
        [marker],
        'Cleaner missed written output; do not erase the whole root to pass',
      )
    } finally {
      observer.close()
    }
  },
)
