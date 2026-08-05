interface WorkerpoolModule {
  worker(methods: Record<string, unknown>): void
}

interface PackageBuildStatsModule {
  getPackageStats(packageString: string): unknown
  getPackageExports(packageString: string): unknown
  getPackageExportSizes(packageString: string): unknown
}

const workerpool = require('workerpool') as WorkerpoolModule
const { getPackageStats, getPackageExports, getPackageExportSizes } =
  require('package-build-stats') as PackageBuildStatsModule

workerpool.worker({
  getPackageStats,
  getPackageExports,
  getPackageExportSizes,
})

export {}
