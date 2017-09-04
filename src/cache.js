require('dotenv').config()

const now = require('performance-now')
const lruRam = require('lru-ram')
const log = require('pretty-log')
const LRU = require('lru-cache')
const {totalmem} = require('os')

const fixture = {
  dependencies: 5,
  devDependencies: 0,
  gzipSize: 7083,
  package: 'react',
  size: 20259,
  version: '15.6.1'
}

const totalBytes = totalmem() * 0.8
const max = lruRam(fixture, totalBytes)
const lruCache = LRU({ max: max })

module.exports = class Cache {
  constructor (firebaseInstance) {
    this.firebase = firebaseInstance
  }

  static cleanKeyForFirebase (key) {
    return key.replace(/[.#$/\[\]]/g, '__')
  }

  async get (packageName, version) {
    const startTime = now()
    const lruCacheCacheEntry = lruCache.get(`${packageName}@${version}`)

    if (lruCacheCacheEntry) {
      log.debug('CACHE HIT: Memory')
      log.debug(`Cache fetch time: ${((now() - startTime) / 1000).toFixed(2)}s`)

      return lruCacheCacheEntry
    } else if (process.env.FIREBASE_API_KEY) {
      const ref = this.firebase.database().ref()
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

  async set (packageName, version, result) {
    lruCache.set(`${packageName}@${version}`, result)

    if (process.env.FIREBASE_API_KEY) {
      const modules = this.firebase.database().ref().child('modules')
      return modules
        .child(Cache.cleanKeyForFirebase(packageName))
        .child(Cache.cleanKeyForFirebase(version))
        .set(result)
    }
  }
}
