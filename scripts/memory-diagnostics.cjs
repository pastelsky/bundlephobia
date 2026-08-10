const fs = require('fs')
const path = require('path')
const v8 = require('v8')
const {
  PerformanceObserver,
  monitorEventLoopDelay,
  performance,
} = require('perf_hooks')

const GIB = 1024 ** 3
const DEFAULT_INTERVAL_MS = 3000
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_MIN_FREE_BYTES = 8 * GIB
const DEFAULT_TIMELINE_SAMPLES = 120

function createRuntimeMetrics() {
  let activeRequests = 0
  let intervalStarted = 0
  let intervalCompleted = 0
  let intervalDurationMs = 0
  let intervalMaxDurationMs = 0
  let intervalRoutes = Object.create(null)
  let intervalStatuses = Object.create(null)
  const providers = new Map()

  function increment(record, key) {
    record[key] = (record[key] || 0) + 1
  }

  return {
    recordRequestStart() {
      activeRequests += 1
      intervalStarted += 1
    },

    recordRequestComplete({ route, status, durationMs }) {
      activeRequests = Math.max(activeRequests - 1, 0)
      intervalCompleted += 1
      intervalDurationMs += durationMs
      intervalMaxDurationMs = Math.max(intervalMaxDurationMs, durationMs)
      increment(intervalRoutes, route)
      increment(intervalStatuses, String(status))
    },

    registerProvider(name, provider) {
      providers.set(name, provider)
      return () => providers.delete(name)
    },

    takeSnapshot() {
      const providerValues = {}
      for (const [name, provider] of providers) {
        try {
          providerValues[name] = provider()
        } catch (error) {
          providerValues[name] = {
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }

      const snapshot = {
        requests: {
          active: activeRequests,
          started: intervalStarted,
          completed: intervalCompleted,
          meanDurationMs:
            intervalCompleted > 0 ? intervalDurationMs / intervalCompleted : 0,
          maxDurationMs: intervalMaxDurationMs,
          routes: intervalRoutes,
          statuses: intervalStatuses,
        },
        providers: providerValues,
      }

      intervalStarted = 0
      intervalCompleted = 0
      intervalDurationMs = 0
      intervalMaxDurationMs = 0
      intervalRoutes = Object.create(null)
      intervalStatuses = Object.create(null)
      return snapshot
    },
  }
}

const runtimeMetrics = createRuntimeMetrics()

function parseBytes(value) {
  const match = /^(\d+)([KMG])?$/i.exec(String(value || '').trim())
  if (!match) {
    throw new Error(`Invalid byte value: ${value}`)
  }

  const units = { K: 1024, M: 1024 ** 2, G: GIB }
  return Number(match[1]) * (units[match[2]?.toUpperCase()] || 1)
}

function getAvailableBytes(directory, fsImpl = fs) {
  const stats = fsImpl.statfsSync(directory, { bigint: true })
  return Number(stats.bavail * stats.bsize)
}

function createMemoryDiagnostics(options) {
  const {
    service,
    thresholdBytes,
    outputRoot,
    intervalMs = DEFAULT_INTERVAL_MS,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    minFreeBytes = DEFAULT_MIN_FREE_BYTES,
    captureHeapSnapshot = true,
    timelineSamples = DEFAULT_TIMELINE_SAMPLES,
    fsImpl = fs,
    memoryUsage = process.memoryUsage,
    heapStatistics = v8.getHeapStatistics,
    heapSpaceStatistics = v8.getHeapSpaceStatistics,
    heapCodeStatistics = v8.getHeapCodeStatistics,
    activeResourcesInfo = process.getActiveResourcesInfo,
    resourceUsage = process.resourceUsage,
    cpuUsage = process.cpuUsage,
    runtimeMetrics: metrics = runtimeMetrics,
    report = process.report,
    writeHeapSnapshot = v8.writeHeapSnapshot,
    now = Date.now,
    pid = process.pid,
    logger = console,
  } = options

  const serviceDirectory = path.join(
    outputRoot,
    service.replace(/[^a-z0-9_-]/gi, '_'),
  )
  const latestSnapshot = path.join(serviceDirectory, 'latest.heapsnapshot')
  const latestMetadata = path.join(serviceDirectory, 'latest.metadata.json')
  const latestTimeline = path.join(serviceDirectory, 'latest.timeline.json')
  const lockDirectory = path.join(outputRoot, '.capture.lock')
  const lockOwner = path.join(lockDirectory, 'pid')
  let handled = false
  const timeline = []
  const gcInterval = { count: 0, durationMs: 0, kinds: Object.create(null) }
  let previousEventLoopUtilization = performance.eventLoopUtilization()
  let previousCpuUsage = cpuUsage()
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
  eventLoopDelay.enable()
  const gcObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const kind = String(entry.detail?.kind ?? 'unknown')
      gcInterval.count += 1
      gcInterval.durationMs += entry.duration
      gcInterval.kinds[kind] = (gcInterval.kinds[kind] || 0) + 1
    }
  })
  gcObserver.observe({ entryTypes: ['gc'] })

  function histogramMilliseconds(value) {
    return Number.isFinite(value) ? value / 1e6 : 0
  }

  function collectSample(memory = memoryUsage()) {
    const currentEventLoopUtilization = performance.eventLoopUtilization(
      previousEventLoopUtilization,
    )
    previousEventLoopUtilization = performance.eventLoopUtilization()
    const currentCpuUsage = cpuUsage(previousCpuUsage)
    previousCpuUsage = cpuUsage()
    const resources = {}
    for (const resource of activeResourcesInfo()) {
      resources[resource] = (resources[resource] || 0) + 1
    }

    const sample = {
      capturedAt: new Date(now()).toISOString(),
      memory,
      heap: heapStatistics(),
      heapSpaces: heapSpaceStatistics(),
      heapCode: heapCodeStatistics(),
      cpu: currentCpuUsage,
      resources: resourceUsage(),
      gc: {
        count: gcInterval.count,
        durationMs: gcInterval.durationMs,
        kinds: gcInterval.kinds,
      },
      eventLoop: {
        utilization: currentEventLoopUtilization.utilization,
        delayMeanMs: histogramMilliseconds(eventLoopDelay.mean),
        delayMaxMs: histogramMilliseconds(eventLoopDelay.max),
        delayP95Ms: histogramMilliseconds(eventLoopDelay.percentile(95)),
        delayP99Ms: histogramMilliseconds(eventLoopDelay.percentile(99)),
      },
      activeResources: resources,
      runtime: metrics.takeSnapshot(),
    }

    timeline.push(sample)
    if (timeline.length > timelineSamples) {
      timeline.shift()
    }
    gcInterval.count = 0
    gcInterval.durationMs = 0
    gcInterval.kinds = Object.create(null)
    eventLoopDelay.reset()
    return sample
  }

  function releaseLock() {
    fsImpl.rmSync(lockDirectory, { recursive: true, force: true })
  }

  function acquireLock() {
    try {
      fsImpl.mkdirSync(lockDirectory)
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }

      try {
        const ownerPid = Number(fsImpl.readFileSync(lockOwner, 'utf8'))
        if (!Number.isInteger(ownerPid) || ownerPid < 1) {
          throw new Error('Invalid lock owner')
        }
        process.kill(ownerPid, 0)
        return false
      } catch (lockError) {
        if (lockError.code === 'EPERM') {
          return false
        }
        fsImpl.rmSync(lockDirectory, { recursive: true, force: true })
        fsImpl.mkdirSync(lockDirectory)
      }
    }

    fsImpl.writeFileSync(lockOwner, String(pid), { mode: 0o600 })
    return true
  }

  function removeIncompleteCaptures() {
    for (const filename of fsImpl.readdirSync(serviceDirectory)) {
      if (filename.startsWith('.latest-')) {
        fsImpl.rmSync(path.join(serviceDirectory, filename), { force: true })
      }
    }
  }

  fsImpl.mkdirSync(serviceDirectory, { recursive: true, mode: 0o700 })
  if (acquireLock()) {
    removeIncompleteCaptures()
    releaseLock()
  }

  function check() {
    const memory = memoryUsage()
    collectSample(memory)
    if (handled || memory.rss < thresholdBytes) {
      return false
    }

    if (!acquireLock()) {
      return false
    }
    removeIncompleteCaptures()

    const suffix = `${now()}-${pid}`
    const temporarySnapshot = path.join(
      serviceDirectory,
      `.latest-${suffix}.heapsnapshot`,
    )
    const temporaryReport = path.join(
      serviceDirectory,
      `.latest-${suffix}.report.json`,
    )
    const temporaryMetadata = path.join(
      serviceDirectory,
      `.latest-${suffix}.metadata.json`,
    )
    const temporaryTimeline = path.join(
      serviceDirectory,
      `.latest-${suffix}.timeline.json`,
    )

    try {
      if (
        captureHeapSnapshot &&
        fsImpl.existsSync(latestSnapshot) &&
        now() - fsImpl.statSync(latestSnapshot).mtimeMs < cooldownMs
      ) {
        return false
      }

      const requiredFreeBytes = captureHeapSnapshot
        ? Math.max(minFreeBytes, thresholdBytes * 3)
        : 0
      if (
        requiredFreeBytes > 0 &&
        getAvailableBytes(serviceDirectory, fsImpl) < requiredFreeBytes
      ) {
        logger.error(
          `[memory-diagnostics] Skipping ${service} capture: insufficient free disk space`,
        )
        return false
      }

      logger.error(
        `[memory-diagnostics] Capturing ${service} at ${memory.rss} bytes RSS`,
      )
      handled = true

      if (report) {
        report.excludeEnv = true
        report.writeReport(temporaryReport)
        fsImpl.chmodSync(temporaryReport, 0o600)
      }

      let smapsRollup
      try {
        smapsRollup = fsImpl.readFileSync('/proc/self/smaps_rollup', 'utf8')
      } catch {}

      fsImpl.writeFileSync(
        temporaryMetadata,
        JSON.stringify(
          {
            service,
            pid,
            capturedAt: new Date(now()).toISOString(),
            memory,
            smapsRollup,
            heapSnapshotCaptured: captureHeapSnapshot,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      )

      fsImpl.writeFileSync(
        temporaryTimeline,
        JSON.stringify({ service, pid, samples: timeline }, null, 2),
        { mode: 0o600 },
      )

      if (captureHeapSnapshot) {
        writeHeapSnapshot(temporarySnapshot)
        fsImpl.renameSync(temporarySnapshot, latestSnapshot)
      }
      if (report) {
        fsImpl.renameSync(
          temporaryReport,
          path.join(serviceDirectory, 'latest.report.json'),
        )
      }
      fsImpl.renameSync(temporaryMetadata, latestMetadata)
      fsImpl.renameSync(temporaryTimeline, latestTimeline)
      logger.error(`[memory-diagnostics] Captured ${service} diagnostics`)
      return true
    } catch (error) {
      logger.error(
        `[memory-diagnostics] Failed to capture ${service}: ${error.message}`,
      )
      return false
    } finally {
      for (const filename of [
        temporarySnapshot,
        temporaryReport,
        temporaryMetadata,
        temporaryTimeline,
      ]) {
        try {
          fsImpl.rmSync(filename, { force: true })
        } catch {}
      }
      releaseLock()
    }
  }

  const timer = setInterval(check, intervalMs)
  timer.unref()
  return {
    check,
    stop: () => {
      clearInterval(timer)
      gcObserver.disconnect()
      eventLoopDelay.disable()
    },
  }
}

function getStartupEnvironment(environment = process.env) {
  if (!environment.pm2_env) {
    return environment
  }
  return { ...JSON.parse(environment.pm2_env), ...environment }
}

function startFromEnvironment() {
  const environment = getStartupEnvironment()
  const service = environment.MEMORY_DIAGNOSTICS_SERVICE
  const threshold = environment.MEMORY_DIAGNOSTICS_RSS_THRESHOLD
  if (!service || !threshold) {
    return false
  }

  createMemoryDiagnostics({
    service,
    thresholdBytes: parseBytes(threshold),
    outputRoot:
      environment.MEMORY_DIAGNOSTICS_DIR || path.resolve('diagnostics'),
    captureHeapSnapshot:
      environment.MEMORY_DIAGNOSTICS_HEAP_SNAPSHOT !== 'false',
  })
  return true
}

startFromEnvironment()

module.exports = {
  createMemoryDiagnostics,
  createRuntimeMetrics,
  getAvailableBytes,
  getStartupEnvironment,
  parseBytes,
  recordRequestStart: () => runtimeMetrics.recordRequestStart(),
  recordRequestComplete: request =>
    runtimeMetrics.recordRequestComplete(request),
  registerMetricsProvider: (name, provider) =>
    runtimeMetrics.registerProvider(name, provider),
}
