import { createReadStream, type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { gzip, gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import S3Fifo from './S3Fifo.ts'
import {
  buildRoot,
  cacheRoot,
  stateRoot,
  usageFiles,
  segmentBytes,
} from './paths.ts'

const compress = promisify(gzip)

const decompress = promisify(gunzip)

const entries = z.array(z.tuple([z.string(), z.number().int().min(0).max(3)]))

const snapshotSchema = z.object({
  version: z.literal(1),
  small: entries,
  main: entries,
  ghost: z.array(z.string()),
  cursors: z.record(z.string(), z.number().int().nonnegative()),
})

const usageSchema = z.array(z.string()).max(20_000)

type Catalog = Map<string, string>

type PackageIndex = Map<string, string[]>

type ReplayContext = {
  oldCursors: Record<string, number>
  index: PackageIndex
  policy: S3Fifo
}

function addEntry(result: Catalog, prefix: string, entry: Dirent) {
  if (entry.name.startsWith('.')) return

  if (!entry.isDirectory() && !entry.isFile()) return
  result.set(`${prefix}${entry.name}`, `${prefix}${entry.name.split('@@')[0]}`)
}

async function catalog(directory: string, capacity: number) {
  const result: Catalog = new Map()

  // Scope containers are the only directories traversed. Never walk payload files.
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const children = await fs.readdir(path.join(directory, entry.name), {
        withFileTypes: true,
      })

      for (const child of children) addEntry(result, `${entry.name}/`, child)
    } else addEntry(result, '', entry)

    if (result.size > capacity)
      throw new Error('Bun catalog exceeds metadata capacity')
  }

  return result
}

async function loadPolicy(stateFile: string, policy: S3Fifo) {
  const previous = await fs.readFile(stateFile).catch(error => {
    if (error.code !== 'ENOENT') throw error

    return undefined
  })

  if (!previous) return {}

  if (previous.length > 4 * 1024 * 1024)
    throw new Error('Cache snapshot exceeds disk budget')

  const restored = snapshotSchema.parse(
    JSON.parse(
      (
        await decompress(previous, { maxOutputLength: 32 * 1024 * 1024 })
      ).toString(),
    ),
  )

  policy.restore(restored)

  return restored.cursors
}

function indexPackages(payloads: Catalog, policy: S3Fifo) {
  const index: PackageIndex = new Map()

  for (const [key, canonical] of payloads) {
    const candidates = index.get(canonical) || []
    candidates.push(key)
    index.set(canonical, candidates)
  }

  for (const key of [...policy.small.keys(), ...policy.main.keys()]) {
    if (!payloads.has(key)) policy.forget(key)
  }

  return index
}

async function* usage(file: string, start: number, size: number) {
  const stream = createReadStream(file, { start, end: size - 1 })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  let offset = start

  try {
    for await (const line of lines) {
      offset += Buffer.byteLength(line) + 1

      // A concurrent append can leave an incomplete final line at the snapshot boundary.
      if (offset > size) break
      yield { dependencies: usageSchema.parse(JSON.parse(line)), offset }
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}

function recordDemand(
  policy: S3Fifo,
  index: PackageIndex,
  dependencies: string[],
) {
  let matched = 0
  let unmatched = 0

  for (const dependency of dependencies) {
    const candidates = index.get(dependency)

    if (!candidates) {
      unmatched++
      continue
    }

    for (const key of candidates) policy.observe(key)
    matched++
  }

  return { matched, unmatched }
}

async function replayFile(file: string, context: ReplayContext) {
  const { oldCursors, index, policy } = context

  const metadata = await fs.stat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error

    return undefined
  })

  if (!metadata) return { matched: 0, unmatched: 0, cursors: {} }

  if (metadata.size > segmentBytes)
    throw new Error('Usage segment exceeds disk budget')
  const identity = `${metadata.dev}:${metadata.ino}:${metadata.birthtimeMs}`
  let offset = oldCursors[identity] || 0
  let matched = 0
  let unmatched = 0

  if (metadata.size > offset) {
    for await (const record of usage(file, offset, metadata.size)) {
      const counts = recordDemand(policy, index, record.dependencies)
      matched += counts.matched
      unmatched += counts.unmatched
      offset = record.offset
    }
  }

  return { matched, unmatched, cursors: { [identity]: offset } }
}

async function replayJournal(stateDirectory: string, context: ReplayContext) {
  let matched = 0
  let unmatched = 0
  const cursors: Record<string, number> = {}

  for (const filename of usageFiles) {
    const counts = await replayFile(
      path.join(stateDirectory, filename),
      context,
    )

    matched += counts.matched
    unmatched += counts.unmatched
    Object.assign(cursors, counts.cursors)
  }

  return { matched, unmatched, cursors }
}

async function pressure(directory: string) {
  const { blocks, bfree, bavail, files, ffree, bsize } =
    await fs.statfs(directory)

  const used = blocks - bfree

  return {
    level: Math.max(
      Math.ceil((100 * used) / (used + bavail)),
      files ? Math.ceil((100 * (files - ffree)) / files) : 0,
    ),
    freeBytes: bavail * bsize,
    freeInodes: ffree,
  }
}

function selectVictims(policy: S3Fifo, payloads: Catalog) {
  const selected: string[] = []

  for (let index = 0; index < 100; index++) {
    const key = policy.victim()

    if (key === undefined) break

    if (payloads.has(key)) selected.push(key)
  }

  return selected
}

async function removeEntry(directory: string, trash: string, key: string) {
  const destination = path.join(trash, randomUUID())

  // An interrupted rm must never leave a partial entry under Bun's cache name.
  const moved = await fs.rename(path.join(directory, key), destination).then(
    () => true,
    error => {
      if (error.code !== 'ENOENT') throw error

      return false
    },
  )

  if (!moved) return false
  await fs.rm(destination, { recursive: true, force: true })

  return true
}

async function reclaim(
  policy: S3Fifo,
  payloads: Catalog,
  options: {
    directory: string
    volume: string
    target: number
    deadline: number
  },
) {
  const { directory, volume, target, deadline } = options
  const trash = path.join(volume, 'cache/bundlephobia-trash')
  await fs.mkdir(trash, { recursive: true })
  const before = await pressure(volume)

  // Resume interrupted deletion only inside our isolated quarantine.
  for (const entry of await fs.readdir(trash)) {
    await fs.rm(path.join(trash, entry), { recursive: true, force: true })
  }

  let current = await pressure(volume)
  let evicted = 0

  while (current.level > target && performance.now() < deadline) {
    const selected = selectVictims(policy, payloads)

    if (!selected.length) break

    for (const key of selected) {
      if (await removeEntry(directory, trash, key)) evicted++
    }

    current = await pressure(volume)
  }

  return {
    evicted,
    pressure: current.level,
    freeBytesChange: current.freeBytes - before.freeBytes,
    freeInodesChange: current.freeInodes - before.freeInodes,
  }
}

async function savePolicy(
  stateFile: string,
  policy: S3Fifo,
  cursors: Record<string, number>,
) {
  const snapshot = await compress(
    JSON.stringify({ version: 1, ...policy.snapshot(), cursors }),
    { level: 1 },
  )

  if (snapshot.length > 4 * 1024 * 1024)
    throw new Error('Cache snapshot exceeds disk budget')
  const temporary = `${stateFile}.tmp`
  await fs.writeFile(temporary, snapshot, { mode: 0o600 })
  await fs.rename(temporary, stateFile)
}

const defaults = {
  directory: cacheRoot,
  volume: buildRoot,
  stateDirectory: stateRoot,
  capacity: 100_000,
  target: 40,
  budgetMs: 15_000,
}

/** The host holds an exclusive OS lock for this whole short-lived job. */
export async function evictCache(options: Partial<typeof defaults> = {}) {
  const { directory, volume, stateDirectory, capacity, target, budgetMs } = {
    ...defaults,
    ...options,
  }

  const started = performance.now()
  const payloads = await catalog(directory, capacity)
  // Queue proportions follow the actual catalog, independently of the metadata guard.
  const policy = new S3Fifo(capacity, payloads.size)
  const stateFile = path.join(stateDirectory, 'policy.json.gz')
  const oldCursors = await loadPolicy(stateFile, policy)
  const index = indexPackages(payloads, policy)

  const demand = await replayJournal(stateDirectory, {
    oldCursors,
    index,
    policy,
  })

  // Downloads without observed use start on probation, not in the hot queue.
  for (const key of payloads.keys()) policy.observe(key, false)
  await fs.mkdir(stateDirectory, { recursive: true, mode: 0o700 })

  const reclaimed = await reclaim(policy, payloads, {
    directory,
    volume,
    target,
    deadline: started + budgetMs,
  })

  await savePolicy(stateFile, policy, demand.cursors)

  return {
    ...reclaimed,
    matched: demand.matched,
    unmatched: demand.unmatched,
    durationMs: performance.now() - started,
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const result = await evictCache()
  const resource = process.resourceUsage()
  console.log(
    JSON.stringify({
      ...result,
      processCpuMs: (resource.userCPUTime + resource.systemCPUTime) / 1000,
      processMaxRssKiB: resource.maxRSS,
    }),
  )
}
