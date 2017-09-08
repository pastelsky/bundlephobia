// Use ES6 supported by Node v6.10 only!

const path = require('path')

module.exports = {
  tmp: path.join(__dirname, '..', 'tmp-build'),

  MAX_WORKERS: require('os').cpus().length,

  MAX_MEMORY_CACHE_ENTRIES: 500,

  WORKER_TIMEOUT: 60 * 1000, //ms,

  DEFAULT_DEV_PORT: 5000,
}