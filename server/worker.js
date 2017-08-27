const workerpool = require('workerpool');
const getPackageSize = require('./getPackageSize')

// create a worker and register public functions
workerpool.worker({
  getPackageSize,
})