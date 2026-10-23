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
  await fs.chmod(root, 0o755)
  const binds = []

  for (const name of Object.keys(writable)) {
    const directory = path.join(root, name)
    await fs.mkdir(directory, { recursive: true, mode: 0o777 })
    await fs.chmod(directory, 0o777)
    binds.push('--bind', directory, directory)
  }

  await fs.mkdir(path.join(root, 'cache/tmp'), { mode: 0o777 })
  await fs.chmod(path.join(root, 'cache/tmp'), 0o777)
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
      '--cap-drop',
      'ALL',
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
      'log() { :; }; source "$1"; cleanup_stale_package_dirs false',
      'cleanup',
      new URL('./cleanup-workspaces.sh', import.meta.url).pathname,
    ],
    { stdio: 'inherit' },
  )
  assert.deepEqual(
    await fs.readdir(path.join(root, 'packages')),
    [],
    'Production cleanup missed generated output',
  )
  console.log(
    'Real builds stayed in approved paths; existing cleanup reclaimed their retained output.',
  )
}
