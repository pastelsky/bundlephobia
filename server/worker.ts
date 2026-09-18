import type { JsonValue } from '../types/json'

type WorkerMethod = (...args: never[]) => JsonValue | Promise<JsonValue>

interface WorkerpoolModule {
  worker(methods: Record<string, WorkerMethod>): void
}

interface PackageBuildStatsModule {
  getPackageStats(packageString: string): JsonValue | Promise<JsonValue>
  getAllPackageExports(packageString: string): JsonValue | Promise<JsonValue>
  getPackageExportSizes(packageString: string): JsonValue | Promise<JsonValue>
}

// SAFETY: the pinned workerpool module implements the worker registration contract.
const workerpool = require('workerpool') as WorkerpoolModule

const { getPackageStats, getAllPackageExports, getPackageExportSizes } =
  // SAFETY: package-build-stats exposes the three worker methods declared above.
  require('package-build-stats') as PackageBuildStatsModule

workerpool.worker({
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
})

export {}
