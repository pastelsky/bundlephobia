const workerpool = require('workerpool')
const getPackageStats = require('package-build-stats')
const {
  getAllPackageExports,
  getPackageExportSizes,
} = require('package-build-stats/src/getPackageExportSizes')

// create a worker and register public functions
workerpool.worker({
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
})
