require('dotenv-defaults').config()
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const { encodeFirebaseKey } = require('../cache.utils')
const {
  createStorageKey,
  getLanguageStorageConfig,
} = require('../../storage/language-storage')
const LRUCache = new LRU({ max: 3000 })

const STORAGE = getLanguageStorageConfig('javascript')
const PACKAGE_ROOT = STORAGE.roots.packageAnalysis

function getMemoryKey(name, version) {
  return createStorageKey(STORAGE, 'package-analysis', `${name}@${version}`)
}

debug(
  'Firebase config: READ from %s (with fallback: %s), WRITE to %s',
  PACKAGE_ROOT.read,
  PACKAGE_ROOT.fallback ? `yes, to ${PACKAGE_ROOT.fallback}` : 'no',
  PACKAGE_ROOT.write
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
  const targetReadKey = readKey || PACKAGE_ROOT.read
  // Try primary read key first
  const result = await getPackageResultFromKey(targetReadKey, { name, version })

  if (result) {
    debug('cache hit: firebase (%s)', targetReadKey)
    return result
  }

  // If reading from default v3 and not found, fall back to v2
  if (!readKey && PACKAGE_ROOT.fallback) {
    const fallbackResult = await getPackageResultFromKey(
      PACKAGE_ROOT.fallback,
      {
        name,
        version,
      }
    )
    if (fallbackResult) {
      debug('cache hit: firebase (fallback to modules-v2)')
    }
    return fallbackResult
  }

  return null
}

async function setPackageResult({ name, version, result }) {
  const modules = firebase.database().ref().child(PACKAGE_ROOT.write)
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
    const memoryKey = getMemoryKey(name, version)
    const lruCacheEntry = LRUCache.get(memoryKey)
    if (lruCacheEntry) {
      debug('cache hit: memory')
      return res.code(200).send(lruCacheEntry)
    }
  }

  const result = await getPackageResult({ name, version, readKey })
  if (result) {
    debug('cache hit: firebase')
    if (!readKey) {
      LRUCache.set(getMemoryKey(name, version), result)
    }
    return res.code(200).send(result)
  }

  return res.code(404).send()
}

async function postPackageSizeMiddlware(req, res) {
  const { name, version, result } = req.body

  if (!name || !version || !result) return res.code(422).send()

  debug('set package %O to %O', { name, version }, result)
  LRUCache.set(getMemoryKey(name, version), result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (err) {
    console.log(err)
    return res.code(500).send({ error: err })
  }
}

module.exports = { getPackageSizeMiddlware, postPackageSizeMiddlware }
