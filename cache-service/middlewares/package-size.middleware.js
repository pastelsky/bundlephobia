require('dotenv-defaults').config()
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const { encodeFirebaseKey } = require('../cache.utils')
const LRUCache = new LRU({ max: 3000 })

// Configurable Firebase keys for read/write operations
// This allows safe migration from modules-v2 (old) to modules-v3 (new package-build-stats 8.x)
// When FIREBASE_READ_KEY is 'modules-v3', it will try v3 first, then fall back to v2
// When FIREBASE_READ_KEY is 'modules-v2', it will only read from v2
const FIREBASE_READ_KEY = process.env.FIREBASE_READ_KEY || 'modules-v3'
const FIREBASE_WRITE_KEY = process.env.FIREBASE_WRITE_KEY || 'modules-v3'

debug(
  'Firebase config: READ from %s (with fallback: %s), WRITE to %s',
  FIREBASE_READ_KEY,
  FIREBASE_READ_KEY === 'modules-v3' ? 'yes, to modules-v2' : 'no',
  FIREBASE_WRITE_KEY
)

async function getPackageResultFromKey(key, { name, version }) {
  const ref = firebase
    .database()
    .ref()
    .child(key)
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

async function getPackageResult({ name, version, readKey }) {
  const targetReadKey = readKey || FIREBASE_READ_KEY
  // Try primary read key first
  const result = await getPackageResultFromKey(targetReadKey, { name, version })

  if (result) {
    debug('cache hit: firebase (%s)', targetReadKey)
    return result
  }

  // If reading from default v3 and not found, fall back to v2
  if (targetReadKey === 'modules-v3' && !readKey) {
    const fallbackResult = await getPackageResultFromKey('modules-v2', {
      name,
      version,
    })
    if (fallbackResult) {
      debug('cache hit: firebase (fallback to modules-v2)')
    }
    return fallbackResult
  }

  return null
}

async function setPackageResult({ name, version, result }) {
  const modules = firebase.database().ref().child(FIREBASE_WRITE_KEY)
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

async function getPackageSizeMiddlware(req, res) {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)
  const readKey = req.query.readKey

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get package %s@%s (readKey: %s)', name, version, readKey)

  // Use memory cache only if no explicit readKey is provided
  if (!readKey) {
    const lruCacheEntry = LRUCache.get(`${name}@${version}`)
    if (lruCacheEntry) {
      debug('cache hit: memory')
      return res.code(200).send(lruCacheEntry)
    }
  }

  const result = await getPackageResult({ name, version, readKey })
  if (result) {
    debug('cache hit: firebase')
    if (!readKey) {
      LRUCache.set(`${name}@${version}`, result)
    }
    return res.code(200).send(result)
  }

  return res.code(404).send()
}

async function postPackageSizeMiddlware(req, res) {
  const { name, version, result } = req.body

  if (!name || !version || !result) return res.code(422).send()

  debug('set package %O to %O', { name, version }, result)
  LRUCache.set(`${name}@${version}`, result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (err) {
    console.log(err)
    return res.code(500).send({ error: err })
  }
}

module.exports = { getPackageSizeMiddlware, postPackageSizeMiddlware }
