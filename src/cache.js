const firebase = require('firebase')
const LRU = require('lru-cache')
const log = require('pretty-log')
const now = require('performance-now')
require('dotenv').config()

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

const lruCache = LRU({ max: 500 })

module.exports = class Cache {
  static cleanKeyForFirebase(key) {
    return key.replace(/[.#$/\[\]]/g, '__')
  }

  static async get(packageName, version) {
    const startTime = now()
    const lruCacheCacheEntry = lruCache.get(`${packageName}@${version}`)

    if (lruCacheCacheEntry) {
      log.debug('CACHE HIT: Memory')
      log.debug(`Cache fetch time: ${((now() - startTime) / 1000).toFixed(2)}s`)

      return lruCacheCacheEntry
    } else if (process.env.FIREBASE_API_KEY) {
      const ref = firebase.database().ref()
        .child('modules')
        .child(Cache.cleanKeyForFirebase(packageName))
        .child(Cache.cleanKeyForFirebase(version))

      return ref
        .once('value')
        .then((snapshot) => {
          const result = snapshot.val()
          if (result) {
            log.debug('CACHE HIT: Firebase')
            lruCache.set(`${packageName}@${version}`, result)
            log.debug(`Cache fetch time: ${((now() - startTime) / 1000).toFixed(2)}s`)
          }

          return Promise.resolve(result)
        })
    }
  }

  static async set(packageName, version, result) {
    lruCache.set(`${packageName}@${version}`, result)

    if (process.env.FIREBASE_API_KEY) {
      const modules = firebase.database().ref().child('modules')
      return modules
        .child(Cache.cleanKeyForFirebase(packageName))
        .child(Cache.cleanKeyForFirebase(version))
        .set(result)
    }
  }
}
