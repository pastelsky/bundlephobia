import createDebug from 'debug'

import logger from './Logger'
import Queue from './Queue'
import config from './config'
import type { FailureCacheEntry } from './types'

interface WorkerPoolLike {
  exec(
    method: string,
    params: unknown[]
  ): { timeout(ms: number): Promise<unknown> }
  terminate(): void
}

interface WorkerpoolModule {
  pool(script: string, options: { maxWorkers: number }): WorkerPoolLike
}

interface LruCacheInstance<K, V> {
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

const pool = workerpool.pool('./server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
}) as WorkerPoolLike

if (process.env.BUILD_SERVICE_ENDPOINT) {
  pool.terminate()
}

export { debug, failureCache, logger, pool, requestQueue }
