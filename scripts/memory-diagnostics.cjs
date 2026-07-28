const fs = require('fs')
const path = require('path')
const v8 = require('v8')

const GIB = 1024 ** 3
const DEFAULT_INTERVAL_MS = 3000
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_MIN_FREE_BYTES = 8 * GIB

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
    fsImpl = fs,
    memoryUsage = process.memoryUsage,
    report = process.report,
    writeHeapSnapshot = v8.writeHeapSnapshot,
    now = Date.now,
    pid = process.pid,
    logger = console,
  } = options

  const serviceDirectory = path.join(
    outputRoot,
    service.replace(/[^a-z0-9_-]/gi, '_')
  )
  const latestSnapshot = path.join(serviceDirectory, 'latest.heapsnapshot')
  const lockDirectory = path.join(outputRoot, '.capture.lock')
  const lockOwner = path.join(lockDirectory, 'pid')
  let handled = false

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
    if (handled || memory.rss < thresholdBytes) {
      return false
    }

    if (!acquireLock()) {
      return false
    }
    handled = true
    removeIncompleteCaptures()

    const suffix = `${now()}-${pid}`
    const temporarySnapshot = path.join(
      serviceDirectory,
      `.latest-${suffix}.heapsnapshot`
    )
    const temporaryReport = path.join(
      serviceDirectory,
      `.latest-${suffix}.report.json`
    )
    const temporaryMetadata = path.join(
      serviceDirectory,
      `.latest-${suffix}.metadata.json`
    )

    try {
      if (
        fsImpl.existsSync(latestSnapshot) &&
        now() - fsImpl.statSync(latestSnapshot).mtimeMs < cooldownMs
      ) {
        return false
      }

      const requiredFreeBytes = Math.max(minFreeBytes, thresholdBytes * 3)
      if (getAvailableBytes(serviceDirectory, fsImpl) < requiredFreeBytes) {
        logger.error(
          `[memory-diagnostics] Skipping ${service} heap snapshot: insufficient free disk space`
        )
        return false
      }

      logger.error(
        `[memory-diagnostics] Capturing ${service} at ${memory.rss} bytes RSS`
      )

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
          },
          null,
          2
        ),
        { mode: 0o600 }
      )

      writeHeapSnapshot(temporarySnapshot)
      fsImpl.renameSync(temporarySnapshot, latestSnapshot)
      if (report) {
        fsImpl.renameSync(
          temporaryReport,
          path.join(serviceDirectory, 'latest.report.json')
        )
      }
      fsImpl.renameSync(
        temporaryMetadata,
        path.join(serviceDirectory, 'latest.metadata.json')
      )
      logger.error(`[memory-diagnostics] Captured ${service} heap snapshot`)
      return true
    } catch (error) {
      logger.error(
        `[memory-diagnostics] Failed to capture ${service}: ${error.message}`
      )
      return false
    } finally {
      for (const filename of [
        temporarySnapshot,
        temporaryReport,
        temporaryMetadata,
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
  return { check, stop: () => clearInterval(timer) }
}

function startFromEnvironment() {
  const service = process.env.MEMORY_DIAGNOSTICS_SERVICE
  const threshold = process.env.MEMORY_DIAGNOSTICS_RSS_THRESHOLD
  if (!service || !threshold) {
    return
  }

  createMemoryDiagnostics({
    service,
    thresholdBytes: parseBytes(threshold),
    outputRoot:
      process.env.MEMORY_DIAGNOSTICS_DIR || path.resolve('diagnostics'),
  })
}

startFromEnvironment()

module.exports = {
  createMemoryDiagnostics,
  getAvailableBytes,
  parseBytes,
}
