import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getPackageStats } from 'package-build-stats'
import { installPackage } from 'package-build-stats/installation'

// These are the only writable data paths, with the same cleanup owners as prod.
const writable = {
  packages:
    'Temporary installs and generated output; disk-clean.sh reaps stale workspaces.',
  cache:
    'Package-manager downloads; existing cache pressure eviction owns retention.',
}

const root =
  process.env.BUILD_TMP_DIR ||
  (await fs.mkdtemp(path.join(os.tmpdir(), 'bp-scratch-')))

if (process.argv[2] !== '--sandboxed') {
  const binds = []

  for (const name of Object.keys(writable)) {
    const directory = path.join(root, name)
    await fs.mkdir(directory, { recursive: true })
    binds.push('--bind', directory, directory)
  }

  await fs.mkdir(path.join(root, 'cache/tmp'))
  execFileSync(
    'sudo',
    [
      'bwrap',
      '--ro-bind',
      '/',
      '/',
      ...binds,
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--die-with-parent',
      '--setenv',
      'PATH',
      process.env.PATH,
      '--setenv',
      'BUILD_TMP_DIR',
      root,
      '--setenv',
      'TMPDIR',
      path.join(root, 'cache/tmp'),
      // Mount setup needs root; builds run as the ordinary runner user.
      'setpriv',
      `--reuid=${process.getuid()}`,
      `--regid=${process.getgid()}`,
      '--clear-groups',
      '--bounding-set=-all',
      '--no-new-privs',
      process.execPath,
      new URL(import.meta.url).pathname,
      '--sandboxed',
    ],
    { stdio: 'inherit' },
  )
} else {
  await assert.rejects(fs.mkdir(path.join(root, 'unapproved')), {
    code: 'EROFS',
  })

  for (const [specifier, client] of [
    ['nanoid@3.3.11', 'bun'],
    ['is-number@7.0.0', 'npm'],
  ]) {
    const installed = await installPackage(specifier, { client })

    const result = await getPackageStats(specifier, {
      debug: true, // Retain real output so the production recovery path gets exercised.
      installationProvider: async () => ({
        ...installed,
        release: async () => {},
      }),
    })

    assert.ok(result.size > 0)
  }

  assert.ok(
    (await fs.readdir(root)).every(name => Object.hasOwn(writable, name)),
  )
  const workspaces = await fs.readdir(path.join(root, 'packages'))
  assert.ok(workspaces.length > 0, 'Builder ignored the isolated scratch root')
  const old = new Date(Date.now() - 2 * 60 * 60_000)
  await Promise.all(
    workspaces.map(name =>
      fs.utimes(path.join(root, 'packages', name), old, old),
    ),
  )
  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; log() { :; }; cleanup_stale_package_dirs false',
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
    ],
    { stdio: 'inherit' },
  )
  assert.deepEqual(
    await fs.readdir(path.join(root, 'packages')),
    [],
    'Production cleanup missed generated output',
  )

  const fixture = path.join(root, 'packages/fd-fixture')
  const scopedPackage = path.join(fixture, 'node_modules/@scope/pkg')
  await fs.mkdir(path.join(scopedPackage, 'dist/cjs/deeper'), {
    recursive: true,
  })
  await fs.writeFile(path.join(fixture, '.gitignore'), 'node_modules/\n')

  for (const name of [
    '.hidden.d.ts',
    'index.d.mts',
    'index.d.cts',
    'dist/cjs/index.map',
  ]) {
    await fs.writeFile(path.join(scopedPackage, name), 'remove')
  }

  await fs.writeFile(path.join(scopedPackage, 'index.js'), 'retain')
  await fs.writeFile(
    path.join(scopedPackage, 'dist/cjs/deeper/retain.map'),
    'retain',
  )
  const bunCache = path.join(root, 'cache/bun')
  await fs.mkdir(path.join(bunCache, '.tmp'), { recursive: true })
  await fs.writeFile(path.join(bunCache, '.tmp/active'), 'in progress')
  await fs.mkdir(path.join(bunCache, 'old package'))
  await fs.mkdir(path.join(bunCache, '@scope/scoped-package'), {
    recursive: true,
  })
  await fs.writeFile(
    path.join(bunCache, '@scope/scoped-package/package.json'),
    '{}',
  )
  await fs.mkdir(path.join(bunCache, '@scope/.tmp'))
  await fs.writeFile(path.join(bunCache, '@scope/.tmp/active'), 'in progress')
  await fs.writeFile(path.join(bunCache, '@manifest.npm'), 'metadata')
  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; log() { :; }; get_loop_usage() { echo 80; }; evict_oldest_bun_cache_entries',
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
    ],
    { stdio: 'inherit' },
  )
  assert.deepEqual((await fs.readdir(bunCache)).sort(), ['.tmp', '@scope'])
  assert.deepEqual(await fs.readdir(path.join(bunCache, '@scope')), ['.tmp'])
  assert.equal(
    await fs.readFile(path.join(bunCache, '.tmp/active'), 'utf8'),
    'in progress',
  )

  const trimCalls = execFileSync(
    'bash',
    [
      '-c',
      `
      source "$1"
      log() { :; }
      get_loop_usage() { echo 65; }
      cleanup_stale_package_dirs() { :; }
      cleanup_npm_cache() { :; }
      evict_large_bun_cache_entries() { :; }
      evict_oldest_bun_cache_entries() { :; }
      trim_loop_device() { echo "TRIMMED"; }
      cleanup_loop_device 60
      cleanup_loop_device 70
      `,
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
    ],
    { encoding: 'utf8' },
  )

  assert.equal(trimCalls.trim(), 'TRIMMED')

  const largePayload = Buffer.alloc(200 * 1024, 'x')
  const nowMs = Date.now()
  const bigOld = path.join(bunCache, 'big-old@1.0.0')
  const smallOld = path.join(bunCache, 'small-old@1.0.0')
  const bigMid = path.join(bunCache, '@scope', 'big-mid@1.0.0')
  const bigFresh = path.join(bunCache, 'big-fresh@1.0.0')

  await fs.mkdir(bigOld, { recursive: true })
  await fs.mkdir(smallOld, { recursive: true })
  await fs.mkdir(bigMid, { recursive: true })
  await fs.mkdir(bigFresh, { recursive: true })

  await fs.writeFile(path.join(bigOld, 'payload.bin'), largePayload)
  await fs.writeFile(path.join(smallOld, 'index.js'), 'export default 1')
  await fs.writeFile(path.join(bigMid, 'payload.bin'), largePayload)
  await fs.writeFile(path.join(bigFresh, 'payload.bin'), largePayload)

  const twentyMinAgo = new Date(nowMs - 20 * 60_000)
  const eightMinAgo = new Date(nowMs - 8 * 60_000)
  const oneMinAgo = new Date(nowMs - 60_000)

  await fs.utimes(bigOld, twentyMinAgo, twentyMinAgo)
  await fs.utimes(smallOld, twentyMinAgo, twentyMinAgo)
  await fs.utimes(bigMid, eightMinAgo, eightMinAgo)
  await fs.utimes(bigFresh, oneMinAgo, oneMinAgo)

  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; log() { :; }; get_loop_usage() { echo 80; }; evict_large_bun_cache_entries 15 100',
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
    ],
    { stdio: 'inherit' },
  )

  await assert.rejects(fs.access(bigOld), { code: 'ENOENT' })
  await fs.access(smallOld)
  await fs.access(bigMid)
  await fs.access(bigFresh)

  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; log() { :; }; get_loop_usage() { echo 80; }; evict_large_bun_cache_entries 5 100',
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
    ],
    { stdio: 'inherit' },
  )

  await assert.rejects(fs.access(bigMid), { code: 'ENOENT' })
  await fs.access(smallOld)
  await fs.access(bigFresh)

  console.log(
    'Real builds stayed in approved paths; existing cleanup reclaimed their retained output.',
  )
}
