import createDebug from 'debug'
import firebase from 'firebase'
import { LRUCache } from 'lru-cache'

import {
  isCacheEntry,
  type CacheEntry,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'

import { encodeFirebaseKey, latestBuiltVersion } from './cache.utils.ts'
import type { CacheRepositoryConfig } from './cache.config.ts'

const debug = createDebug('bp:cache')

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
    return firebase.database().ref().child(root).child(encodeFirebaseKey(name))
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
    const snapshot = await packageRef(root, name).once('value')
    const newest = latestBuiltVersion(snapshot.val())

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
    if (key.version === 'latest-built') return latestBuilt(root, key.name)

    const snapshot = await firebase
      .database()
      .ref()
      .child(root)
      .child(encodeFirebaseKey(key.name))
      .child(encodeFirebaseKey(key.version))
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
        memoryCache.set(cacheKey(key), result, {
          ttl: key.version === 'latest-built' ? 60000 : 0,
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
            ttl: key.version === 'latest-built' ? 60000 : 0,
          })
        }

        return fallbackResult
      }

      return null
    },

    async set(key, result) {
      await firebase
        .database()
        .ref()
        .child(config.writeKey)
        .child(encodeFirebaseKey(key.name))
        .child(encodeFirebaseKey(key.version))
        .set(result)

      // Keep memory and durable storage write-through consistent.
      memoryCache.set(cacheKey(key), result)
      memoryCache.delete(cacheKey({ name: key.name, version: 'latest-built' }))
    },
  }
}
