const workerpool = require('workerpool');
const getPackageStats = require('package-build-stats')

// create a worker and register public functions
workerpool.worker({
  getPackageStats,
})