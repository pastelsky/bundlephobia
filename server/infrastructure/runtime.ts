import createDebug from 'debug'

import logger from './logger.service'
import Queue from './queue.service'
import config from '../config'
import type { FailureCacheEntry } from '../types'
import { registerMetricsProvider } from './memory-diagnostics.service'
import { applicationMetrics } from './application-metrics'
import { registerQueueMetrics } from './queue-metrics.mts'

interface WorkerPoolExecution extends Promise<unknown> {
  cancel?: () => void
  timeout(ms: number): WorkerPoolExecution
}

interface WorkerPoolLike {
  exec(method: string, params: unknown[]): WorkerPoolExecution
  terminate(): void
}

interface WorkerpoolModule {
  pool(script: string, options: { maxWorkers: number }): WorkerPoolLike
}

interface LruCacheInstance<K, V> {
  size: number
  get(key: K): V | undefined
  set(key: K, value: V): this
  delete(key: K): boolean
}

interface LruCacheConstructor {
  new <K, V>(options: { max: number; ttl: number }): LruCacheInstance<K, V>
}

// SAFETY: lru-cache v11 exposes its constructor as the named LRUCache export.
const { LRUCache: LRU } = require('lru-cache') as {
  LRUCache: LruCacheConstructor
}

// SAFETY: the pinned workerpool module implements the pool contract above.
const workerpool = require('workerpool') as WorkerpoolModule

const failureCache = new LRU<string, FailureCacheEntry>({
  max: config.MAX_FAILURE_CACHE_ENTRIES,
  ttl: 30 * 24 * 60 * 60 * 1000,
})

const debug = createDebug('bp:request')

const requestQueue = new Queue({
  concurrency: 4,
  // Four active builds and at most sixteen waiting.
  maxJobs: 20,
  maxAge: 30,
})

registerQueueMetrics(applicationMetrics, 'analysis', () =>
  requestQueue.getDiagnostics(),
)

// SAFETY: workerpool returns the cancellable execution handle used by the server.
const pool = workerpool.pool('./server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
}) as WorkerPoolLike

if (process.env.BUILD_SERVICE_ENDPOINT) {
  pool.terminate()
}

registerMetricsProvider('main', () => ({
  queue: requestQueue.getDiagnostics(),
  failureCacheEntries: failureCache.size,
}))

export { debug, failureCache, logger, pool, requestQueue }
