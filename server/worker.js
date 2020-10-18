const workerpool = require('workerpool')
const {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
} = require('package-build-stats')

// create a worker and register public functions
workerpool.worker({
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
})
