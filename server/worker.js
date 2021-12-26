const workerpool = require('workerpool')
const {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
} = require('package-build-stats')

const getPackageStatsIncreasedTimeout = (name, options) =>
  getPackageStats(name, { ...options, installTimeout: 120000 })

// create a worker and register public functions
workerpool.worker({
  getPackageStats: getPackageStatsIncreasedTimeout,
  getAllPackageExports,
  getPackageExportSizes,
})
