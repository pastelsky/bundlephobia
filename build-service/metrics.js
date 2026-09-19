import fs from 'node:fs/promises'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const DEFAULT_SAMPLE_INTERVAL_MS = 250
const DEFAULT_SLOW_BUILD_MS = 10_000
const DEFAULT_PEAK_RSS_MB = 512
const DEFAULT_CPU_MS = 5_000
const DEFAULT_DISK_DELTA_MB = 256
const CLOCK_TICKS_PER_SECOND = 100
const PAGE_SIZE_BYTES = 4096

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

async function readProcessTree() {
  if (process.platform !== 'linux') {
    const memory = process.memoryUsage()
    return {
      processes: new Map(),
      rssBytes: memory.rss,
      cpuMs: 0,
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

  return { processes: tree, rssBytes, cpuMs }
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

export function isExpensiveBuild(metrics) {
  return (
    metrics.status !== 'success' ||
    metrics.durationMs >= thresholds.slowBuildMs ||
    metrics.peakRssBytes >= thresholds.peakRssBytes ||
    metrics.cpuMs >= thresholds.cpuMs ||
    Math.abs(metrics.diskUsedDeltaBytes ?? 0) >= thresholds.diskDeltaBytes
  )
}

export async function measureBuild({ operation, packageString, run }) {
  const startedAt = performance.now()
  const startedFilesystem = await readFilesystemStats(
    process.env.BUILD_TMP_DIR || '/tmp/tmp-build',
  )
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
  const previousProcesses = new Map()
  let cpuMs = 0
  let peakRssBytes = 0
  let peakHeapUsedBytes = 0
  let peakExternalBytes = 0
  let peakArrayBuffersBytes = 0
  let latestProcessCount = 0

  const sample = async () => {
    const snapshot = await readProcessTree()
    const memory = process.memoryUsage()
    peakRssBytes = Math.max(peakRssBytes, snapshot.rssBytes)
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed)
    peakExternalBytes = Math.max(peakExternalBytes, memory.external)
    peakArrayBuffersBytes = Math.max(peakArrayBuffersBytes, memory.arrayBuffers)
    latestProcessCount = snapshot.processes.size

    for (const [key, processRecord] of snapshot.processes) {
      const processCpuMs =
        ((processRecord.userTicks + processRecord.systemTicks) * 1000) /
        CLOCK_TICKS_PER_SECOND
      const previous = previousProcesses.get(key)
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
    const metrics = {
      package: packageString,
      operation,
      status,
      durationMs: round(performance.now() - startedAt),
      cpuMs: round(cpuMs),
      peakRssBytes,
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
      processCountAtEnd: latestProcessCount,
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
      console.warn('BUILD_METRICS', metrics)
    }
  }
}
