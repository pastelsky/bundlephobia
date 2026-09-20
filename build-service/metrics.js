import fs from 'node:fs/promises'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const DEFAULT_SAMPLE_INTERVAL_MS = 250

const DEFAULT_SLOW_BUILD_MS = 10_000

const DEFAULT_PEAK_RSS_MB = 512

const DEFAULT_CPU_MS = 5_000

const DEFAULT_DISK_DELTA_MB = 256

const CLOCK_TICKS_PER_SECOND = 100

const PAGE_SIZE_BYTES = 4096

const MAX_PEAK_PROCESSES = 6

const MAX_COMMAND_LENGTH = 160

const DEFAULT_MAX_ARTIFACTS = 200

const MAX_PROCESS_PEAKS = 12

const MIN_PEAK_DETAIL_DELTA_BYTES = 16 * 1024 * 1024

let artifactSequence = 0

function positiveNumber(value, fallback) {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const thresholds = {
  sampleIntervalMs: positiveNumber(
    process.env.BUILD_METRICS_SAMPLE_INTERVAL_MS,
    DEFAULT_SAMPLE_INTERVAL_MS,
  ),
  slowBuildMs: positiveNumber(
    process.env.BUILD_METRICS_SLOW_BUILD_MS,
    DEFAULT_SLOW_BUILD_MS,
  ),
  peakRssBytes:
    positiveNumber(process.env.BUILD_METRICS_PEAK_RSS_MB, DEFAULT_PEAK_RSS_MB) *
    1024 *
    1024,
  cpuMs: positiveNumber(process.env.BUILD_METRICS_CPU_MS, DEFAULT_CPU_MS),
  diskDeltaBytes:
    positiveNumber(
      process.env.BUILD_METRICS_DISK_DELTA_MB,
      DEFAULT_DISK_DELTA_MB,
    ) *
    1024 *
    1024,
}

function parseProcStat(contents) {
  const closingParen = contents.lastIndexOf(')')

  if (closingParen < 0) return undefined

  const fields = contents
    .slice(closingParen + 2)
    .trim()
    .split(/\s+/)

  if (fields.length < 22) return undefined

  return {
    ppid: Number(fields[1]),
    userTicks: Number(fields[11]),
    systemTicks: Number(fields[12]),
    startTime: fields[19],
    rssBytes: Number(fields[21]) * PAGE_SIZE_BYTES,
  }
}

async function readProcessRecord(pid) {
  try {
    const stat = parseProcStat(await fs.readFile(`/proc/${pid}/stat`, 'utf8'))

    if (!stat || !Number.isFinite(stat.ppid)) return undefined

    return { pid, ...stat }
  } catch {
    // Processes can exit between /proc enumeration and readFile.
    return undefined
  }
}

async function readProcessCommand(pid) {
  try {
    const command = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')

    return command.replaceAll('\0', ' ').trim().slice(0, MAX_COMMAND_LENGTH)
  } catch {
    return undefined
  }
}

function parseMemoryStats(contents) {
  const stats = {}

  for (const line of contents.split('\n')) {
    const [key, value, unit] = line.trim().split(/\s+/)

    if (!key || !value) continue

    const parsed = Number(value)

    if (!Number.isFinite(parsed)) continue

    const normalizedKey = key.endsWith(':') ? key.slice(0, -1) : key
    stats[normalizedKey] = unit === 'kB' ? parsed * 1024 : parsed
  }

  return stats
}

async function readProcessMemory(pid) {
  try {
    const contents = await fs.readFile(`/proc/${pid}/smaps_rollup`, 'utf8')
    const stats = parseMemoryStats(contents)

    return {
      rssBytes: stats.Rss,
      pssBytes: stats.Pss,
      anonymousBytes: stats.Pss_Anon,
      fileBytes: stats.Pss_File,
      privateDirtyBytes: stats.Private_Dirty,
      swapBytes: stats.Swap,
    }
  } catch {
    return undefined
  }
}

async function readCgroupStats() {
  const cgroupPaths = ['/sys/fs/cgroup', '/sys/fs/cgroup/memory']

  for (const path of cgroupPaths) {
    const currentPath = `${path}/memory.current`
    const peakPath = `${path}/memory.peak`
    const eventsPath = `${path}/memory.events`
    const swapPath = `${path}/memory.swap.current`

    try {
      const [current, peak, events, swap] = await Promise.all([
        fs.readFile(currentPath, 'utf8'),
        fs.readFile(peakPath, 'utf8'),
        fs.readFile(eventsPath, 'utf8'),
        fs.readFile(swapPath, 'utf8').catch(() => undefined),
      ])

      return {
        currentBytes: Number(current.trim()),
        peakBytes: Number(peak.trim()),
        swapCurrentBytes: swap ? Number(swap.trim()) : undefined,
        events: parseMemoryStats(events),
      }
    } catch {
      // Try the next cgroup layout when this host uses cgroup v1.
    }
  }

  return undefined
}

async function readDetailedProcesses(processes) {
  const details = await Promise.all(
    [...processes.values()].map(async processRecord => ({
      pid: processRecord.pid,
      ppid: processRecord.ppid,
      startTime: processRecord.startTime,
      rssBytes: processRecord.rssBytes,
      cpuMs: round(
        ((processRecord.userTicks + processRecord.systemTicks) * 1000) /
          CLOCK_TICKS_PER_SECOND,
      ),
      command: await readProcessCommand(processRecord.pid),
      memory: await readProcessMemory(processRecord.pid),
    })),
  )

  return details
    .sort((left, right) => right.rssBytes - left.rssBytes)
    .slice(0, MAX_PEAK_PROCESSES)
}

// Process discovery necessarily branches around platform and process-lifecycle races.
// oxlint-disable-next-line complexity
async function readProcessTree() {
  if (process.platform !== 'linux') {
    const memory = process.memoryUsage()

    return {
      processes: new Map(),
      rssBytes: memory.rss,
      nodeRssBytes: memory.rss,
      childRssBytes: 0,
      cpuMs: 0,
      processCount: 1,
    }
  }

  const entries = await fs.readdir('/proc', { withFileTypes: true })

  const records = (
    await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map(entry => readProcessRecord(Number(entry.name))),
    )
  ).filter(Boolean)

  const childrenByParent = new Map()

  for (const record of records) {
    const children = childrenByParent.get(record.ppid) ?? []
    children.push(record)
    childrenByParent.set(record.ppid, children)
  }

  const tree = new Map()
  const pending = [process.pid]

  while (pending.length > 0) {
    const pid = pending.pop()

    if (tree.has(pid)) continue

    const record = records.find(item => item.pid === pid)

    if (!record) continue
    tree.set(`${record.pid}:${record.startTime}`, record)
    pending.push(...(childrenByParent.get(pid) ?? []).map(item => item.pid))
  }

  let rssBytes = 0
  let cpuMs = 0

  for (const record of tree.values()) {
    rssBytes += record.rssBytes
    cpuMs +=
      ((record.userTicks + record.systemTicks) * 1000) / CLOCK_TICKS_PER_SECOND
  }

  const nodeRecord = [...tree.values()].find(
    record => record.pid === process.pid,
  )

  const nodeRssBytes = nodeRecord?.rssBytes ?? 0

  return {
    processes: tree,
    rssBytes,
    nodeRssBytes,
    childRssBytes: Math.max(0, rssBytes - nodeRssBytes),
    cpuMs,
    processCount: tree.size,
  }
}

async function readFilesystemStats(path) {
  try {
    const stats = await fs.statfs(path)
    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)

    return {
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes,
    }
  } catch {
    return undefined
  }
}

function round(value) {
  return Math.round(value * 100) / 100
}

function getMetricsDirectory() {
  return (
    process.env.BUILD_METRICS_DIR ||
    path.join(process.env.BUILD_TMP_DIR || '/tmp/tmp-build', 'build-metrics')
  )
}

function getMaxArtifacts() {
  return Math.floor(
    positiveNumber(
      process.env.BUILD_METRICS_MAX_ARTIFACTS,
      DEFAULT_MAX_ARTIFACTS,
    ),
  )
}

function safePackageName(packageString) {
  return packageString.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)
}

// oxlint-disable-next-line complexity
function compareArtifacts(left, right) {
  return (
    (right.peakRssBytes ?? 0) - (left.peakRssBytes ?? 0) ||
    (right.rssRetainedBytes ?? 0) - (left.rssRetainedBytes ?? 0) ||
    (right.durationMs ?? 0) - (left.durationMs ?? 0) ||
    (right.cpuMs ?? 0) - (left.cpuMs ?? 0) ||
    Math.abs(right.diskUsedDeltaBytes ?? 0) -
      Math.abs(left.diskUsedDeltaBytes ?? 0)
  )
}

async function pruneMetricArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })

  const artifacts = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(async entry => ({
        name: entry.name,
        metrics: await fs
          .readFile(path.join(directory, entry.name), 'utf8')
          .then(contents => JSON.parse(contents))
          .catch(() => ({})),
      })),
  )

  const rankedArtifacts = artifacts.sort((left, right) =>
    compareArtifacts(left.metrics, right.metrics),
  )

  const retainedArtifacts = rankedArtifacts.slice(0, getMaxArtifacts())
  const staleArtifacts = rankedArtifacts.slice(getMaxArtifacts())

  await Promise.all(
    staleArtifacts.map(artifact =>
      fs.unlink(path.join(directory, artifact.name)).catch(() => {}),
    ),
  )

  return new Set(retainedArtifacts.map(artifact => artifact.name))
}

async function writeMetricsArtifact(metrics) {
  const directory = getMetricsDirectory()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const sequence = artifactSequence++
  const filename = `${timestamp}-${process.pid}-${sequence}-${metrics.operation}-${safePackageName(metrics.package)}.json`
  const artifactPath = path.join(directory, filename)
  const temporaryPath = `${artifactPath}.tmp-${process.pid}-${sequence}`

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(metrics, null, 2)}\n`,
      'utf8',
    )
    await fs.rename(temporaryPath, artifactPath)
    const retainedArtifacts = await pruneMetricArtifacts(directory)

    return retainedArtifacts.has(filename) ? artifactPath : undefined
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {})

    return `write-failed:${error?.code || error?.name || 'unknown'}`
  }
}

function summarizeMetrics(metrics, artifactPath) {
  return {
    package: metrics.package,
    operation: metrics.operation,
    status: metrics.status,
    durationMs: metrics.durationMs,
    cpuMs: metrics.cpuMs,
    peakRssMb: metrics.peakRssMb,
    peakNodeRssMb: round(metrics.peakNodeRssBytes / 1024 / 1024),
    peakChildRssMb: round(metrics.peakChildRssBytes / 1024 / 1024),
    peakUnattributedMb: round(metrics.peakUnattributedBytes / 1024 / 1024),
    rssAfterMb: metrics.rssAfterMb,
    rssRetainedMb: round(metrics.rssRetainedBytes / 1024 / 1024),
    processCountAtPeak: metrics.processCountAtPeak,
    processCountAtEnd: metrics.processCountAtEnd,
    diskUsedDeltaMb: round((metrics.diskUsedDeltaBytes ?? 0) / 1024 / 1024),
    errorName: metrics.errorName,
    errorCode: metrics.errorCode,
    artifactPath,
  }
}

export function isExpensiveBuild(metrics) {
  return (
    metrics.status !== 'success' ||
    metrics.durationMs >= thresholds.slowBuildMs ||
    metrics.peakRssBytes >= thresholds.peakRssBytes ||
    metrics.cpuMs >= thresholds.cpuMs ||
    Math.abs(metrics.diskUsedDeltaBytes ?? 0) >= thresholds.diskDeltaBytes
  )
}

// Sampling and finalization intentionally live together so every build has one
// consistent lifecycle, including failures during setup and cleanup.
// oxlint-disable-next-line complexity
export async function measureBuild({ operation, packageString, run }) {
  const startedAt = performance.now()

  const startedFilesystem = await readFilesystemStats(
    process.env.BUILD_TMP_DIR || '/tmp/tmp-build',
  )

  const startedCgroup = await readCgroupStats()

  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
  const previousProcesses = new Map()
  let cpuMs = 0
  let peakRssBytes = 0
  let peakHeapUsedBytes = 0
  let peakExternalBytes = 0
  let peakArrayBuffersBytes = 0
  let initialRssBytes
  let initialNodeRssBytes
  let initialChildRssBytes
  let initialHeapUsedBytes
  let initialProcessCount
  let processCountAtPeak = 0
  let peakNodeRssBytes = 0
  let peakChildRssBytes = 0
  let lastDetailedPeakRssBytes = 0
  let peakProcesses = []
  const processPeaks = new Map()

  // oxlint-disable-next-line complexity
  const sample = async () => {
    const snapshot = await readProcessTree()
    const memory = process.memoryUsage()
    const reachedNewPeak = snapshot.rssBytes > peakRssBytes
    peakRssBytes = Math.max(peakRssBytes, snapshot.rssBytes)
    peakNodeRssBytes = Math.max(peakNodeRssBytes, snapshot.nodeRssBytes)
    peakChildRssBytes = Math.max(peakChildRssBytes, snapshot.childRssBytes)
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed)
    peakExternalBytes = Math.max(peakExternalBytes, memory.external)
    peakArrayBuffersBytes = Math.max(peakArrayBuffersBytes, memory.arrayBuffers)
    initialRssBytes ??= snapshot.rssBytes
    initialNodeRssBytes ??= snapshot.nodeRssBytes
    initialChildRssBytes ??= snapshot.childRssBytes
    initialHeapUsedBytes ??= memory.heapUsed
    initialProcessCount ??= snapshot.processCount

    if (reachedNewPeak) {
      processCountAtPeak = snapshot.processCount
    }

    if (
      reachedNewPeak &&
      (peakProcesses.length === 0 ||
        snapshot.rssBytes >=
          lastDetailedPeakRssBytes + MIN_PEAK_DETAIL_DELTA_BYTES)
    ) {
      lastDetailedPeakRssBytes = snapshot.rssBytes

      const topProcesses = [...snapshot.processes.values()]
        .sort((left, right) => right.rssBytes - left.rssBytes)
        .slice(0, MAX_PEAK_PROCESSES)

      peakProcesses = await Promise.all(
        topProcesses.map(async processRecord => ({
          pid: processRecord.pid,
          ppid: processRecord.ppid,
          startTime: processRecord.startTime,
          rssBytes: processRecord.rssBytes,
          command: await readProcessCommand(processRecord.pid),
          memory: await readProcessMemory(processRecord.pid),
        })),
      )
    }

    for (const [key, processRecord] of snapshot.processes) {
      const previous = previousProcesses.get(key)

      const existingPeak = processPeaks.get(key)

      const processCpuMs =
        ((processRecord.userTicks + processRecord.systemTicks) * 1000) /
        CLOCK_TICKS_PER_SECOND

      processPeaks.set(key, {
        pid: processRecord.pid,
        ppid: processRecord.ppid,
        startTime: processRecord.startTime,
        peakRssBytes: Math.max(
          existingPeak?.peakRssBytes ?? 0,
          processRecord.rssBytes,
        ),
        peakCpuMs: Math.max(existingPeak?.peakCpuMs ?? 0, processCpuMs),
        command:
          existingPeak?.command ??
          (await readProcessCommand(processRecord.pid)),
      })

      if (previous) {
        cpuMs += Math.max(0, processCpuMs - previous)
      }

      previousProcesses.set(key, processCpuMs)
    }
  }

  await sample()
  eventLoopDelay.enable()

  const interval = setInterval(() => {
    void sample()
  }, thresholds.sampleIntervalMs)

  interval.unref?.()

  let status = 'success'
  let error

  try {
    return await run()
  } catch (caughtError) {
    status = 'error'
    error = caughtError
    throw caughtError
  } finally {
    clearInterval(interval)
    await sample()
    eventLoopDelay.disable()

    const endedFilesystem = await readFilesystemStats(
      process.env.BUILD_TMP_DIR || '/tmp/tmp-build',
    )

    const endedCgroup = await readCgroupStats()
    const finalSnapshot = await readProcessTree()

    const processPeakDetails = [...processPeaks.values()]
      .sort((left, right) => right.peakRssBytes - left.peakRssBytes)
      .slice(0, MAX_PROCESS_PEAKS)

    const metrics = {
      package: packageString,
      operation,
      status,
      durationMs: round(performance.now() - startedAt),
      cpuMs: round(cpuMs),
      rssBeforeBytes: initialRssBytes,
      nodeRssBeforeBytes: initialNodeRssBytes,
      childRssBeforeBytes: initialChildRssBytes,
      rssAfterBytes: finalSnapshot.rssBytes,
      nodeRssAfterBytes: finalSnapshot.nodeRssBytes,
      childRssAfterBytes: finalSnapshot.childRssBytes,
      rssAfterMb: round(finalSnapshot.rssBytes / 1024 / 1024),
      rssRetainedBytes: finalSnapshot.rssBytes - initialRssBytes,
      nodeRssRetainedBytes: finalSnapshot.nodeRssBytes - initialNodeRssBytes,
      peakRssBytes,
      peakNodeRssBytes,
      peakChildRssBytes,
      peakUnattributedBytes: Math.max(
        0,
        peakRssBytes - peakHeapUsedBytes - peakExternalBytes,
      ),
      peakRssMb: round(peakRssBytes / 1024 / 1024),
      peakHeapUsedBytes,
      peakExternalBytes,
      peakArrayBuffersBytes,
      rssScope:
        process.platform === 'linux' ? 'process-tree-sum' : 'node-process-only',
      cpuScope:
        process.platform === 'linux'
          ? 'process-tree'
          : 'not-available-on-this-platform',
      processCountAtStart: initialProcessCount,
      processCountAtPeak,
      processCountAtEnd: finalSnapshot.processCount,
      peakProcesses,
      processPeakDetails,
      cgroupAtStart: startedCgroup,
      cgroupAtEnd: endedCgroup,
      heapUsedBeforeBytes: initialHeapUsedBytes,
      heapUsedAfterBytes: process.memoryUsage().heapUsed,
      diskScope: 'filesystem',
      diskUsedBytes: endedFilesystem?.usedBytes,
      diskFreeBytes: endedFilesystem?.freeBytes,
      diskUsedDeltaBytes:
        startedFilesystem && endedFilesystem
          ? endedFilesystem.usedBytes - startedFilesystem.usedBytes
          : undefined,
      eventLoopDelayMaxMs: round(eventLoopDelay.max / 1e6),
      eventLoopDelayMeanMs: round(eventLoopDelay.mean / 1e6),
      errorName: error?.name,
      errorCode: error?.code,
      thresholds: {
        slowBuildMs: thresholds.slowBuildMs,
        peakRssMb: thresholds.peakRssBytes / 1024 / 1024,
        cpuMs: thresholds.cpuMs,
        diskDeltaMb: thresholds.diskDeltaBytes / 1024 / 1024,
      },
    }

    if (isExpensiveBuild(metrics)) {
      metrics.processesAtEnd = await readDetailedProcesses(
        finalSnapshot.processes,
      )
      const artifactPath = await writeMetricsArtifact(metrics)
      console.warn('BUILD_METRICS', summarizeMetrics(metrics, artifactPath))
    }
  }
}
