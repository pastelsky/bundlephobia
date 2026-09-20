import createDebug from 'debug'

import logger from './logger.service'
import Queue from './queue.service'
import config from '../config/server.config'
import type { FailureCacheEntry } from '../types/server.type'
import { registerMetricsProvider } from './memory-diagnostics.service'

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
  itemCount: number
  get(key: K): V | undefined
  set(key: K, value: V): this
  del?(key: K): void
}

interface LruCacheConstructor {
  new <K, V>(options: { max: number; maxAge: number }): LruCacheInstance<K, V>
}

// SAFETY: the pinned lru-cache module implements the constructor contract above.
const LRU = require('lru-cache') as LruCacheConstructor

// SAFETY: the pinned workerpool module implements the pool contract above.
const workerpool = require('workerpool') as WorkerpoolModule

const failureCache = new LRU<string, FailureCacheEntry>({
  max: config.MAX_FAILURE_CACHE_ENTRIES,
  maxAge: 6 * 1000 * 60 * 60,
})

const debug = createDebug('bp:request')

const requestQueue = new Queue({
  concurrency: 4,
  maxAge: 60 * 2,
})

// SAFETY: workerpool returns the cancellable execution handle used by the server.
const pool = workerpool.pool('./server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
}) as WorkerPoolLike

if (process.env.BUILD_SERVICE_ENDPOINT) {
  pool.terminate()
}

registerMetricsProvider('main', () => ({
  queue: requestQueue.getDiagnostics(),
  failureCacheEntries: failureCache.itemCount,
}))

export { debug, failureCache, logger, pool, requestQueue }
