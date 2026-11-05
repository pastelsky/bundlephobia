import { statfs } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { StatsFs } from 'node:fs'
import { Counter, Gauge } from 'prom-client'
import { applicationMetrics } from './application-metrics'

const GiB = 1024 ** 3

export interface DiskHeadroom {
  scratchBytes: number
  rootBytes: number
  scratchInodes: number
  rootInodes: number
}

type BreakerReason = 'disk_pressure' | 'disk_check_failed'

function hasPressure(disk: DiskHeadroom) {
  return (
    disk.scratchBytes < 5 * GiB ||
    disk.rootBytes < 5 * GiB ||
    disk.scratchInodes < 0.1 ||
    disk.rootInodes < 0.1
  )
}

function hasRecoveryHeadroom(disk: DiskHeadroom) {
  return (
    disk.scratchBytes >= 10 * GiB &&
    disk.rootBytes >= 8 * GiB &&
    disk.scratchInodes >= 0.2 &&
    disk.rootInodes >= 0.2
  )
}

// This is an emergency guard, independent of caller identity and rate limits.
export class BuildCircuitBreaker {
  private open = false
  private recoveredAt: number | undefined
  private checkedAt = Number.NEGATIVE_INFINITY
  private checking?: Promise<boolean>

  constructor(
    private readonly read: () => Promise<DiskHeadroom>,
    private readonly onChange: (open: boolean, reason: BreakerReason) => void,
    private readonly now = Date.now,
  ) {}

  check(): Promise<boolean> {
    if (this.checking) return this.checking

    if (this.now() - this.checkedAt < 5000) return Promise.resolve(this.open)

    this.checking = this.sample().finally(() => {
      this.checking = undefined
    })

    return this.checking
  }

  private trip(reason: BreakerReason) {
    this.recoveredAt = undefined

    if (!this.open) this.onChange(true, reason)
    this.open = true
  }

  private recover(disk: DiskHeadroom) {
    if (!this.open) return

    if (!hasRecoveryHeadroom(disk)) {
      this.recoveredAt = undefined

      return
    }

    this.recoveredAt ??= this.now()

    if (this.now() - this.recoveredAt < 60_000) return
    this.open = false
    this.recoveredAt = undefined
    this.onChange(false, 'disk_pressure')
  }

  private async sample(): Promise<boolean> {
    try {
      const disk = await this.read()

      if (hasPressure(disk)) this.trip('disk_pressure')
      else this.recover(disk)
    } catch {
      this.trip('disk_check_failed')
    }

    this.checkedAt = this.now()

    return this.open
  }
}

// Fresh hosts have no scratch directory until the first install creates it.
// Its nearest existing ancestor belongs to the filesystem that will store it.
export async function readBuildFilesystem(
  directory: string,
  read: (directory: string) => Promise<StatsFs> = statfs,
): Promise<StatsFs> {
  try {
    return await read(directory)
  } catch (error) {
    const parent = dirname(directory)

    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      parent !== directory
    ) {
      return readBuildFilesystem(parent, read)
    }

    throw error
  }
}

const activations = new Counter({
  name: 'bundlephobia_build_circuit_breaker_activations_total',
  help: 'Transitions into emergency cache-only mode; not requests or rejections.',
  labelNames: ['reason'],
  registers: [applicationMetrics],
})

const active = new Gauge({
  name: 'bundlephobia_build_circuit_breaker_active',
  help: 'One while uncached analysis admission is disabled by the disk guard.',
  registers: [applicationMetrics],
})

const responses = new Counter({
  name: 'bundlephobia_build_circuit_breaker_responses_total',
  help: 'Origin analysis responses while the breaker is active; cached responses are not necessarily incremental cache hits.',
  labelNames: ['result'],
  registers: [applicationMetrics],
})

for (const reason of ['disk_pressure', 'disk_check_failed'])
  activations.inc({ reason }, 0)

for (const result of ['cache_served', 'rejected', 'other'])
  responses.inc({ result }, 0)

active.set(0)

export const buildCircuitBreaker = new BuildCircuitBreaker(
  async () => {
    const [scratch, root] = await Promise.all([
      readBuildFilesystem(
        resolve(process.env.BUILD_TMP_DIR || '/tmp/tmp-build'),
      ),
      statfs('/'),
    ])

    return {
      scratchBytes: scratch.bavail * scratch.bsize,
      rootBytes: root.bavail * root.bsize,
      scratchInodes: scratch.files > 0 ? scratch.ffree / scratch.files : 1,
      rootInodes: root.files > 0 ? root.ffree / root.files : 1,
    }
  },
  (open, reason) => {
    active.set(Number(open))

    if (open) activations.inc({ reason })
  },
)

export function recordCircuitBreakerResponse(
  cache: boolean,
  rejected: boolean,
) {
  responses.inc({
    result: cache ? 'cache_served' : rejected ? 'rejected' : 'other',
  })
}

// Keep state and recovery samples current even when there are no analysis requests.
const monitor = setInterval(() => {
  void buildCircuitBreaker.check()
}, 5000)

monitor.unref()
