import type { JsonValue } from '../types/json'
import { createInstallationProvider } from '../build-service/installationProvider.ts'

type WorkerMethod = (...args: never[]) => JsonValue | Promise<JsonValue>

interface WorkerpoolModule {
  worker(methods: Record<string, WorkerMethod>): void
}

interface WorkerBuildOptions {
  entryPoint?: string
  installationProvider?: ReturnType<typeof createInstallationProvider>
}

interface PackageBuildStatsModule {
  getPackageStats(
    packageString: string,
    options?: WorkerBuildOptions,
  ): JsonValue | Promise<JsonValue>
  getAllPackageExports(
    packageString: string,
    options?: WorkerBuildOptions,
  ): JsonValue | Promise<JsonValue>
  getPackageExportSizes(
    packageString: string,
    options?: WorkerBuildOptions,
  ): JsonValue | Promise<JsonValue>
  getPackageEntryPoints(
    packageString: string,
    options?: WorkerBuildOptions,
  ): JsonValue | Promise<JsonValue>
}

// SAFETY: the pinned workerpool module implements the worker registration contract.
const workerpool = require('workerpool') as WorkerpoolModule

const {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
  getPackageEntryPoints,
} =
  // SAFETY: package-build-stats exposes the worker methods declared above.
  require('package-build-stats') as PackageBuildStatsModule

const installationProvider = process.env.INSTALLATION_SERVICE_ENDPOINT
  ? createInstallationProvider(process.env.INSTALLATION_SERVICE_ENDPOINT)
  : undefined

const methods = {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
  getPackageEntryPoints,
}

workerpool.worker(
  Object.fromEntries(
    Object.entries(methods).map(([name, analyze]) => [
      name,
      (packageString: string, options: WorkerBuildOptions = {}) =>
        analyze(packageString, { ...options, installationProvider }),
    ]),
  ),
)

export {}
