import createDebug from 'debug'
import firebase from 'firebase'
import { LRUCache } from 'lru-cache'

import {
  isCacheEntry,
  cacheStoragePath,
  type CacheEntry,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'

import { normalizeEntryPoint } from '@bundlephobia/service-contracts/package'
import type { CacheRepositoryConfig } from './cache.config.ts'

const debug = createDebug('bp:cache')

export interface CacheRepository {
  get(key: CacheKey): Promise<CacheEntry | null>
  set(key: CacheKey, result: CacheEntry): Promise<void>
}

function cacheKey({ name, version, entryPoint }: CacheKey): string {
  return JSON.stringify([name, version, normalizeEntryPoint(entryPoint)])
}

export function createCacheRepository(
  config: CacheRepositoryConfig,
): CacheRepository {
  const memoryCache = new LRUCache<string, CacheEntry>({
    max: config.memoryMax,
  })

  async function getFromFirebase(
    root: string,
    key: CacheKey,
  ): Promise<CacheEntry | null> {
    const snapshot = await firebase
      .database()
      .ref()
      .child(cacheStoragePath(root, key).join('/'))
      .once('value')

    const value = snapshot.val()

    if (value === null) return null

    if (!isCacheEntry(value)) {
      throw new Error(`Invalid cache entry in Firebase root ${root}`)
    }

    return value
  }

  return {
    async get(key) {
      const cached = memoryCache.get(cacheKey(key))

      if (cached !== undefined) {
        debug('cache hit: memory')

        return cached
      }

      const result = await getFromFirebase(config.readKey, key)

      if (result !== null) {
        debug('cache hit: firebase (%s)', config.readKey)
        memoryCache.set(cacheKey(key), result)

        return result
      }

      if (config.fallbackReadKey && !normalizeEntryPoint(key.entryPoint)) {
        const fallbackResult = await getFromFirebase(
          config.fallbackReadKey,
          key,
        )

        if (fallbackResult !== null) {
          debug('cache hit: firebase fallback (%s)', config.fallbackReadKey)
          memoryCache.set(cacheKey(key), fallbackResult)
        }

        return fallbackResult
      }

      return null
    },

    async set(key, result) {
      await firebase
        .database()
        .ref()
        .child(cacheStoragePath(config.writeKey, key).join('/'))
        .set(result)

      // Keep memory and durable storage write-through consistent.
      memoryCache.set(cacheKey(key), result)
    },
  }
}
