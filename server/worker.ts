interface WorkerpoolModule {
  worker(methods: Record<string, unknown>): void
}

interface PackageBuildStatsModule {
  getPackageStats(packageString: string): unknown
  getAllPackageExports(packageString: string): unknown
  getPackageExportSizes(packageString: string): unknown
}

const workerpool = require('workerpool') as WorkerpoolModule
const { getPackageStats, getAllPackageExports, getPackageExportSizes } =
  require('package-build-stats') as PackageBuildStatsModule

workerpool.worker({
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
})

export {}
