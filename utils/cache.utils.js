const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const CacheUtils = require('./firebase.utils')
const config = require('../server/config')
require('dotenv').config()

const lruCache = LRU({ max: config.MAX_MEMORY_CACHE_ENTRIES })

class Cache {
  constructor(firebaseInstance) {
    this.firebaseUtils = new CacheUtils(firebaseInstance)
  }

  async get({ name, version }) {
    debug('get %s@%s', name, version)
    const lruCacheEntry = lruCache.get(`${name}@${version}`)

    if (lruCacheEntry) {
      debug('cache hit: memory')
      return lruCacheEntry
    } else if (process.env.FIREBASE_API_KEY) {
      const result = await this.firebaseUtils.getPackageResult({ name, version })
      if (result) {
        debug('cache hit: firebase')
        lruCache.set(`${name}@${version}`, result)
      }
      return result
    }
  }

  async set({ name, version }, result) {
    debug('set %O to %O', { name, version }, result)
    lruCache.set(`${name}@${version}`, result)

    if (process.env.FIREBASE_API_KEY) {
      return this.firebaseUtils.setPackageResult({ name, version }, result)
    }
  }
}

module.exports = Cache
