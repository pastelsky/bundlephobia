const config = require('./config')
const LRU = require('lru-cache')
const workerpool = require('workerpool')
const Queue = require('./Queue')
const logger = require('./Logger')

const failureCache = new LRU({
  max: config.MAX_FAILURE_CACHE_ENTRIES,
  maxAge: 6 * 1000 * 60 * 60,
})

const debug = require('debug')('bp:request')

const requestQueue = new Queue({
  concurrency: 4,
  maxAge: 60 * 2,
})

const pool = workerpool.pool(`./server/worker.js`, {
  maxWorkers: config.MAX_WORKERS,
})

if (process.env.BUILD_SERVICE_ENDPOINT) {
  pool.terminate()
}

module.exports = {
  failureCache,
  requestQueue,
  pool,
  debug,
  logger,
}
