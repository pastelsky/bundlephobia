import createDebug from 'debug'
import Redis from 'ioredis'

import logger from './Logger'
import Queue from './Queue'
import config from './config'
import type { FailureCacheEntry } from './types'
import { registerMetricsProvider } from './MemoryDiagnostics'
import PackageWorkerRegistry from './api/PackageWorkerRegistry'

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

const LRU = require('lru-cache') as LruCacheConstructor
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

const affinityRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
    })
  : undefined
affinityRedis?.on('error', error => {
  debug('Redis package-worker connection failed: %O', error)
})
const packageWorkerRegistry = new PackageWorkerRegistry(affinityRedis)

const pool = workerpool.pool('./server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
}) as WorkerPoolLike

if (process.env.BUILD_SERVICE_ENDPOINT || process.env.BUILD_SERVICE_ENDPOINTS) {
  pool.terminate()
}

registerMetricsProvider('main', () => ({
  queue: requestQueue.getDiagnostics(),
  failureCacheEntries: failureCache.itemCount,
}))

export {
  debug,
  failureCache,
  logger,
  packageWorkerRegistry,
  pool,
  requestQueue,
}
