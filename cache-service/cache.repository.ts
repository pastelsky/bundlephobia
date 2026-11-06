import createDebug from 'debug'
import { getDatabase, ref, get, set } from 'firebase/database'
import { LRUCache } from 'lru-cache'

import {
  isCacheEntry,
  LATEST_BUILT_CACHE_VERSION,
  type CacheEntry,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'

import { encodeFirebaseKey, latestBuiltVersion } from './cache.utils.ts'
import type { CacheRepositoryConfig } from './cache.config.ts'

const debug = createDebug('bp:cache')

const latestBuiltCacheTtlMs = 60_000

export interface CacheRepository {
  get(key: CacheKey): Promise<CacheEntry | null>
  set(key: CacheKey, result: CacheEntry): Promise<void>
}

function cacheKey({ name, version }: CacheKey): string {
  return `${name}@${version}`
}

export function createCacheRepository(
  config: CacheRepositoryConfig,
): CacheRepository {
  const memoryCache = new LRUCache<string, CacheEntry>({
    max: config.memoryMax,
  })

  const latestRequests = new LRUCache<string, Promise<CacheEntry | null>>({
    max: config.memoryMax,
  })

  function packageRef(root: string, name: string) {
    return ref(getDatabase(), `${root}/${encodeFirebaseKey(name)}`)
  }

  function latestBuilt(root: string, name: string): Promise<CacheEntry | null> {
    const key = `${root}/${name}`
    let pending = latestRequests.get(key)

    if (!pending) {
      pending = loadLatestBuilt(root, name).finally(() => {
        latestRequests.delete(key)
      })
      latestRequests.set(key, pending)
    }

    return pending
  }

  async function loadLatestBuilt(
    root: string,
    name: string,
  ): Promise<CacheEntry | null> {
    // Existing histories are small; avoid a second persistent index/write path.
    const snapshot = await get(packageRef(root, name))
    const versions: string[] = []

    snapshot.forEach(child => {
      if (child.key) versions.push(child.key)
    })

    const newest = latestBuiltVersion(versions)

    if (!newest) return null

    const value = snapshot.child(encodeFirebaseKey(newest)).val()

    if (!isCacheEntry(value))
      throw new Error(`Invalid cache entry in Firebase root ${root}`)

    return value
  }

  async function getFromFirebase(
    root: string,
    key: CacheKey,
  ): Promise<CacheEntry | null> {
    // Internal cache query: newest built stable release, not npm latest.
    if (key.version === LATEST_BUILT_CACHE_VERSION)
      return latestBuilt(root, key.name)

    const snapshot = await get(
      ref(
        getDatabase(),
        `${root}/${encodeFirebaseKey(key.name)}/${encodeFirebaseKey(key.version)}`,
      ),
    )

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
        memoryCache.set(cacheKey(key), result, {
          ttl:
            key.version === LATEST_BUILT_CACHE_VERSION
              ? latestBuiltCacheTtlMs
              : 0,
        })

        return result
      }

      if (config.fallbackReadKey) {
        const fallbackResult = await getFromFirebase(
          config.fallbackReadKey,
          key,
        )

        if (fallbackResult !== null) {
          debug('cache hit: firebase fallback (%s)', config.fallbackReadKey)
          memoryCache.set(cacheKey(key), fallbackResult, {
            ttl:
              key.version === LATEST_BUILT_CACHE_VERSION
                ? latestBuiltCacheTtlMs
                : 0,
          })
        }

        return fallbackResult
      }

      return null
    },

    async set(key, result) {
      await set(
        ref(
          getDatabase(),
          `${config.writeKey}/${encodeFirebaseKey(key.name)}/${encodeFirebaseKey(key.version)}`,
        ),
        result,
      )

      // Keep memory and durable storage write-through consistent.
      memoryCache.set(cacheKey(key), result)
      memoryCache.delete(
        cacheKey({ name: key.name, version: LATEST_BUILT_CACHE_VERSION }),
      )
    },
  }
}
