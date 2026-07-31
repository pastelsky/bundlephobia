interface RequestMetric {
  route: string
  status: number
  durationMs: number
}

interface MemoryDiagnosticsModule {
  recordRequestStart(): void
  recordRequestComplete(request: RequestMetric): void
  registerMetricsProvider(name: string, provider: () => unknown): () => boolean
}

const diagnostics =
  require('../scripts/memory-diagnostics.cjs') as MemoryDiagnosticsModule

export const recordRequestStart = () => diagnostics.recordRequestStart()
export const recordRequestComplete = (request: RequestMetric) =>
  diagnostics.recordRequestComplete(request)
export const registerMetricsProvider = (
  name: string,
  provider: () => unknown
) => diagnostics.registerMetricsProvider(name, provider)
