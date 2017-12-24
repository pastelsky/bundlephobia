// Use ES6 supported by Node v6.10 only!

const path = require('path')

module.exports = {
  tmp: path.join(__dirname, '..', 'tmp-build'),

  MAX_WORKERS: require('os').cpus().length,

  MAX_FAILURE_CACHE_ENTRIES: 600,

  WORKER_TIMEOUT: 600 * 1000, //ms,

  DEFAULT_DEV_PORT: 5000,
}