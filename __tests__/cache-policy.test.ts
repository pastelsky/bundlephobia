import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import ReusePolicy from '../installation-service/cache/ReusePolicy.ts'
import { createPackageManagerCommand } from '../installation-service/cache/paths.ts'

test('reuse policy promotes a second materialization, retains quick-eviction history and bounds counters', () => {
  const policy = new ReusePolicy(10)
  policy.observe('shared', false)
  policy.observe('shared')
  expect(policy.small.get('shared')).toBe(1)
  policy.observe('shared')

  for (let index = 0; index < 5; index++) policy.observe(`cold-${index}`, false)
  expect(policy.victim()).toBe('cold-0')
  expect(policy.main.has('shared')).toBe(true)
  policy.observe('cold-0')
  expect(policy.main.has('cold-0')).toBe(true)

  for (let index = 0; index < 100; index++) policy.observe('shared')
  expect(policy.main.get('shared')).toBe(3)
  const restored = new ReusePolicy(10)
  restored.restore(policy.snapshot())
  expect(restored.snapshot()).toEqual(policy.snapshot())
})

test('queue cursors survive empty queues and keep ghost history bounded', () => {
  const policy = new ReusePolicy(20)

  for (let index = 0; index < 1000; index++) {
    const key = `cold-${index}`
    policy.observe(key)
    expect(policy.victim()).toBe(key)
  }

  expect(policy.ghost.size).toBeLessThanOrEqual(18)
})

test('queue proportions follow the observed catalog instead of the metadata guard', () => {
  const policy = new ReusePolicy(100_000, 10)
  policy.observe('hot')
  expect(policy.small.get('hot')).toBe(1)
  policy.observe('hot')
  policy.observe('cold-1', false)
  policy.observe('cold-2', false)
  expect(policy.victim()).toBe('cold-1')
  expect(policy.main.has('hot')).toBe(true)
  expect(policy.victim()).toBe('cold-2')
})

const linuxDescribe = process.platform === 'linux' ? describe : describe.skip

linuxDescribe('Linux cache coordination', () => {
  test('Bun shared locks coexist and exclude cleanup until the command finishes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-lock-test-'))
    const lock = path.join(root, 'cache.lock')

    const shared = spawn('flock', [
      '--shared',
      lock,
      process.execPath,
      '-e',
      'process.stdout.write("ready"); process.stdin.resume()',
    ])

    try {
      await once(shared.stdout, 'data')
      expect(
        spawnSync('flock', ['--shared', '--nonblock', lock, 'true']).status,
      ).toBe(0)
      expect(
        spawnSync('flock', ['--exclusive', '--nonblock', lock, 'true']).status,
      ).toBe(1)
      const closed = once(shared, 'close')
      shared.stdin.end()
      await closed
      expect(
        spawnSync('flock', ['--exclusive', '--nonblock', lock, 'true']).status,
      ).toBe(0)
    } finally {
      shared.stdin.end()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

test('host locking is absent when disabled and only wraps Bun on Linux', () => {
  expect(createPackageManagerCommand(false)).toBeUndefined()
  const wrap = createPackageManagerCommand(true)!
  expect(wrap('npm', ['install'])).toEqual({
    command: 'npm',
    args: ['install'],
  })
  const command = wrap('bun', ['add', 'example'])
  expect(command.command).toBe(process.platform === 'linux' ? 'flock' : 'bun')
  expect(command.args.slice(-3)).toEqual(
    process.platform === 'linux'
      ? ['bun', 'add', 'example']
      : ['add', 'example'],
  )
})

test('cron defers eviction when the coordinated cleanup fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-policy-test-'))

  try {
    const mode = path.join(root, 'policy')
    await fs.writeFile(mode, 'reuse\n')

    const output = execFileSync(
      'bash',
      [
        '-c',
        `
      source "$1"
      LOG_FILE=/dev/null
      BUN_CACHE_POLICY_FILE="$2"
      log() { echo "$*"; }
      get_loop_usage() { echo 80; }
      cleanup_stale_package_dirs() { :; }
      trim_loop_device() { :; }
      curl() { return 22; }
      prune_bun_cache() { echo UNSAFE_FALLBACK; }
      cleanup_npm_cache() { echo UNSAFE_FALLBACK; }
      evict_oldest_bun_cache_entries() { echo UNSAFE_FALLBACK; }
      cleanup_loop_device
    `,
        'fixture',
        path.resolve('operations/disk-clean.sh'),
        mode,
      ],
      { encoding: 'utf8' },
    )

    expect(output).toContain('keeping cache entries for safe retry')
    expect(output).not.toContain('UNSAFE_FALLBACK')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

function native(script: string, root: string) {
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BUILD_TMP_DIR: root,
        BUN_CACHE_STATE_DIR: path.join(root, 'state'),
      },
      encoding: 'utf8',
    }),
  )
}

test('journal cursors prevent replaying old demand and preserve an incomplete append', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-policy-test-'))

  try {
    await fs.mkdir(path.join(root, 'cache/bun/shared@1.0.0@@registry'), {
      recursive: true,
    })
    const state = path.join(root, 'state')
    await fs.mkdir(state)
    const current = path.join(state, 'usage.current.jsonl')
    await fs.writeFile(current, '["shared@1.0.0"]\n')

    const url = pathToFileURL(
      path.resolve('installation-service/cache/evict.ts'),
    ).href

    const script = `import { evictCache } from ${JSON.stringify(url)}; console.log(JSON.stringify(await evictCache({ target: 101 })))`
    expect(native(script, root).matched).toBe(1)
    expect(native(script, root).matched).toBe(0)
    await fs.appendFile(current, '["shared@1.0.')
    expect(native(script, root).matched).toBe(0)
    await fs.appendFile(current, '0"]\n')
    expect(native(script, root).matched).toBe(1)
    await fs.rename(current, path.join(state, 'usage.previous.jsonl'))
    await fs.writeFile(current, '["shared@1.0.0"]\n')
    expect(native(script, root).matched).toBe(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('actual entry deletion preserves installation hardlinks and temporary staging', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-policy-test-'))

  try {
    const directory = path.join(root, 'cache/bun')
    const payload = path.join(directory, '@scope/shared@1.0.0@@registry')
    await fs.mkdir(payload, { recursive: true })
    await fs.mkdir(path.join(directory, '.tmp'), { recursive: true })
    await fs.writeFile(path.join(payload, 'index.js'), 'export default 1')
    await fs.link(
      path.join(payload, 'index.js'),
      path.join(root, 'borrowed.js'),
    )

    const url = pathToFileURL(
      path.resolve('installation-service/cache/evict.ts'),
    ).href

    const result = native(
      `import { evictCache } from ${JSON.stringify(url)}; console.log(JSON.stringify(await evictCache({ target: -1 })))`,
      root,
    )

    expect(result.evicted).toBe(1)
    expect(await fs.readFile(path.join(root, 'borrowed.js'), 'utf8')).toBe(
      'export default 1',
    )
    await expect(fs.stat(payload)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(path.join(directory, '.tmp'))).resolves.toBeDefined()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('dependency accounting deduplicates aliases and skips omitted dependencies', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-policy-test-'))

  try {
    for (const name of ['first', 'alias', '@scope/shared']) {
      const manifest = path.join(root, 'node_modules', name, 'package.json')
      await fs.mkdir(path.dirname(manifest), { recursive: true })
      await fs.writeFile(manifest, '{}')
    }

    await fs.writeFile(
      path.join(root, 'bun.lock'),
      '{"packages":{"first":["first@1.0.0"],"alias":["first@1.0.0"],"@scope/shared":["@scope/shared@2.0.0"],"omitted":["omitted@1.0.0"]},}',
    )

    const url = pathToFileURL(
      path.resolve('installation-service/cache/bun-cache.ts'),
    ).href

    const result = native(
      `import { installedDependencies } from ${JSON.stringify(url)}; console.log(JSON.stringify(await installedDependencies(${JSON.stringify(root)})))`,
      root,
    )

    expect(result.sort()).toEqual(['@scope/shared@2.0.0', 'first@1.0.0'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
