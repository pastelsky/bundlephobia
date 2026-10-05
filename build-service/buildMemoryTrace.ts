import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'

const phaseDetails = z.object({ duration: z.number() })

type PhaseMark = {
  event: string
  attribution: 'async-context' | 'sole-active-build'
  elapsedMs: number
  durationMs: number
  rssBytes: number
  heapUsedBytes: number
  externalBytes: number
  concurrentBuilds: number
}

type BuildTrace = {
  id: number
  operation: string
  packageString: string
  startedAt: number
  phases: PhaseMark[]
}

const storage = new AsyncLocalStorage<BuildTrace>()

const active = new Map<number, BuildTrace>()

let nextId = 0

export function startBuildTrace(operation: string, packageString: string) {
  const trace: BuildTrace = {
    id: nextId++,
    operation,
    packageString,
    startedAt: performance.now(),
    phases: [],
  }

  active.set(trace.id, trace)

  return {
    phases: trace.phases,
    run: <T>(work: () => Promise<T>) => storage.run(trace, work),
    finish: () => active.delete(trace.id),
  }
}

export function activeBuildCount() {
  return active.size
}

export function activeBuilds() {
  return [...active.values()].map(trace => ({
    operation: trace.operation,
    package: trace.packageString,
    elapsedMs: Math.round(performance.now() - trace.startedAt),
    lastPhase: trace.phases.at(-1)?.event,
  }))
}

// package-build-stats already emits terminal events for compile, stats parsing,
// dependency sizing, and other phases. Correlate those with the existing RSS
// samples without adding a second profiler to the library.
export function recordBuildPhase(
  event: string | symbol,
  // mitt exposes an untyped payload; validate once at the library boundary.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  details: unknown,
) {
  const contextualTrace = storage.getStore()

  // Rspack's native completion callback can lose async context. A single
  // active build is unambiguous; never guess when multiple builds overlap.
  const trace =
    contextualTrace ??
    (active.size === 1 ? active.values().next().value : undefined)

  const phase = String(event)

  if (!trace || !phase.startsWith('TASK_PACKAGE_')) {
    return
  }

  const parsed = phaseDetails.safeParse(details)

  if (!parsed.success) return

  const memory = process.memoryUsage()
  trace.phases.push({
    event: phase,
    attribution: contextualTrace ? 'async-context' : 'sole-active-build',
    elapsedMs: Math.round(performance.now() - trace.startedAt),
    durationMs: Math.round(parsed.data.duration),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    concurrentBuilds: active.size,
  })
}
