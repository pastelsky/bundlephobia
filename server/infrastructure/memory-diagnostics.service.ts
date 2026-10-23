import type { JsonObject } from '../../types/json'

interface RequestMetric {
  route: string
  status: number
  durationMs: number
}

interface MemoryDiagnosticsModule {
  recordRequestStart(): void
  recordRequestComplete(request: RequestMetric): void
  registerMetricsProvider(
    name: string,
    provider: () => JsonObject,
  ): () => boolean
}

// SAFETY: the CommonJS diagnostics module exports the typed runtime API below.
const diagnostics =
  require('../../scripts/memory-diagnostics.cjs') as MemoryDiagnosticsModule

export const recordRequestStart = () => diagnostics.recordRequestStart()

export const recordRequestComplete = (request: RequestMetric) =>
  diagnostics.recordRequestComplete(request)

export const registerMetricsProvider = (
  name: string,
  provider: () => JsonObject,
) => diagnostics.registerMetricsProvider(name, provider)
