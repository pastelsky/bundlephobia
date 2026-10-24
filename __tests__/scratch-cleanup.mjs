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
  const bunCache = path.join(root, 'cache/bun')
  await fs.mkdir(path.join(bunCache, '.tmp'), { recursive: true })
  await fs.mkdir(path.join(bunCache, 'old package'), { recursive: true })
  await fs.writeFile(path.join(bunCache, 'old manifest.npm'), 'metadata')
  await fs.writeFile(path.join(bunCache, '.tmp/active'), 'in progress')
  const agedPackage = path.join(bunCache, 'cleanup-fixture@1.0.0@@@1')
  await fs.mkdir(agedPackage)
  await fs.writeFile(path.join(agedPackage, 'package.json'), '{}')
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60_000)
  await fs.utimes(agedPackage, yesterday, yesterday)
  execFileSync(
    'bash',
    [
      '-c',
      'BUN_BIN="$2"; source "$1"; LOG_FILE=/dev/null; log() { :; }; prune_bun_cache',
      'cleanup',
      new URL('../operations/disk-clean.sh', import.meta.url).pathname,
      execFileSync('which', ['bun'], { encoding: 'utf8' }).trim(),
    ],
    { stdio: 'inherit' },
  )
  await assert.rejects(fs.access(agedPackage), { code: 'ENOENT' })
  await fs.access(path.join(bunCache, 'old package'))
  await fs.access(path.join(bunCache, 'old manifest.npm'))
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
  assert.deepEqual(await fs.readdir(bunCache), ['.tmp'])
  assert.equal(
    await fs.readFile(path.join(bunCache, '.tmp/active'), 'utf8'),
    'in progress',
  )

  console.log(
    'Real builds stayed in approved paths; existing cleanup reclaimed their retained output.',
  )
}
