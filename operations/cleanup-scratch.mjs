#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

export const scratchPolicy = JSON.parse(
  await fs.readFile(new URL('./scratch-policy.json', import.meta.url), 'utf8'),
)

const defaultRoot = '/tmp/tmp-build'

const disposableMarker = '.bundlephobia-disposable'

const workspaceAgeMs = 60 * 60_000

for (const name of Object.keys(scratchPolicy)) {
  if (name !== path.basename(name) || name === '.' || name === '..') {
    throw new Error(`Invalid scratch policy directory: ${name}`)
  }
}

async function entries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function usage(root) {
  const { blocks, bfree, bavail } = await fs.statfs(root)
  const used = blocks - bfree

  return Math.ceil((100 * used) / (used + bavail))
}

async function candidates(directory) {
  try {
    const stat = await fs.lstat(directory)

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`Unsafe scratch directory: ${directory}`)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const children = await entries(directory)

  const found = await Promise.all(
    children.map(async entry => {
      const location = path.join(directory, entry.name)

      try {
        const stat = await fs.lstat(location)

        return { location, mtime: stat.mtimeMs, directory: stat.isDirectory() }
      } catch (error) {
        if (error.code === 'ENOENT') return undefined
        throw error
      }
    }),
  )

  return found.filter(Boolean)
}

async function pressureCandidates(root) {
  const reclaimable = []

  for (const [name, policy] of Object.entries(scratchPolicy)) {
    const directory = path.join(root, name)

    if (policy.reclaim === 'workspace') {
      const workspaces = await candidates(directory)
      reclaimable.push(
        ...workspaces.filter(
          entry => entry.directory && entry.mtime < Date.now() - workspaceAgeMs,
        ),
      )
    }

    if (policy.reclaim === 'cache') {
      const cache = await candidates(directory)
      // Bun cache entries are individually disposable; leave active staging alone.
      const bun = await candidates(path.join(directory, 'bun'))
      reclaimable.push(
        ...cache.filter(entry => path.basename(entry.location) !== 'bun'),
      )
      reclaimable.push(
        ...bun.filter(entry => path.basename(entry.location) !== '.tmp'),
      )
    }
  }

  return reclaimable.sort((left, right) => left.mtime - right.mtime)
}

async function requireDisposableRoot(root) {
  if (root === defaultRoot)
    throw new Error('--all refuses the production scratch root')

  const marker = JSON.parse(
    await fs.readFile(path.join(root, disposableMarker), 'utf8'),
  )

  if (
    marker.ownerPid !== process.ppid ||
    marker.purpose !== 'cleanup-contract'
  ) {
    throw new Error(
      '--all requires a disposable root created by the parent test harness',
    )
  }
}

async function reclaim(root, all) {
  const removed = []

  if (all) {
    // Writers must have exited. Never remove an unknown root to make the test pass.
    for (const name of Object.keys(scratchPolicy)) {
      await fs.rm(path.join(root, name), { recursive: true, force: true })
      removed.push(name)
    }
  } else if ((await usage(root)) >= 60) {
    for (const entry of await pressureCandidates(root)) {
      if ((await usage(root)) <= 40) break
      await fs.rm(entry.location, { recursive: true, force: true })
      removed.push(path.relative(root, entry.location))
    }
  }

  return removed
}

export async function cleanupScratch(root, all = false) {
  root = path.resolve(root)
  const stat = await fs.lstat(root)

  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Scratch root must be a real directory')

  if (all) await requireDisposableRoot(root)

  const before = await usage(root)
  const removed = await reclaim(root, all)

  const unknown = (await entries(root))
    .map(entry => entry.name)
    .filter(
      name =>
        !Object.hasOwn(scratchPolicy, name) &&
        !(all && name === disposableMarker),
    )

  console.log(
    JSON.stringify({
      root,
      before,
      after: await usage(root),
      removed,
      unknown,
    }),
  )

  if (unknown.length)
    throw new Error(`Unmanaged scratch paths: ${unknown.join(', ')}`)
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      all: { type: 'boolean', default: false },
    },
  })

  await cleanupScratch(
    values.root || process.env.BUILD_TMP_DIR || defaultRoot,
    values.all,
  )
}
