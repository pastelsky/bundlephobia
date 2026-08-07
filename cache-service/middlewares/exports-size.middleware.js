require('dotenv-defaults').config()
const LRU = require('lru-cache')
const firebase = require('firebase')
const debug = require('debug')('bp:cache')
const { encodeFirebaseKey } = require('../cache.utils')
const {
  createStorageKey,
  getLanguageStorageConfig,
} = require('../../storage/language-storage')

const LRUCache = new LRU({ max: 1500 })

const STORAGE = getLanguageStorageConfig('javascript')
const EXPORTS_ROOT = STORAGE.roots.packageExports

function getMemoryKey(name, version) {
  return createStorageKey(STORAGE, 'package-export-sizes', `${name}@${version}`)
}

debug(
  'Firebase config (exports): READ from %s (with fallback: %s), WRITE to %s',
  EXPORTS_ROOT.read,
  EXPORTS_ROOT.fallback ? `yes, to ${EXPORTS_ROOT.fallback}` : 'no',
  EXPORTS_ROOT.write
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
  const targetReadKey = readKey || EXPORTS_ROOT.read
  // Try primary read key first
  const result = await getPackageResultFromKey(targetReadKey, { name, version })

  if (result) {
    debug('cache hit: firebase (%s)', targetReadKey)
    return result
  }

  // If reading from default v3 and not found, fall back to "exports" (v2)
  if (!readKey && EXPORTS_ROOT.fallback) {
    const fallbackResult = await getPackageResultFromKey(
      EXPORTS_ROOT.fallback,
      {
        name,
        version,
      }
    )
    if (fallbackResult) {
      debug('cache hit: firebase (fallback to exports)')
    }
    return fallbackResult
  }

  return null
}

async function setPackageResult({ name, version, result }) {
  const modules = firebase.database().ref().child(EXPORTS_ROOT.write)
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

async function getExportsSizeMiddlware(req, res) {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)
  const readKey = req.query.readKey

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get exports %s@%s (readKey: %s)', name, version, readKey)

  // Use memory cache only if no explicit readKey is provided
  if (!readKey) {
    const lruCacheEntry = LRUCache.get(getMemoryKey(name, version))
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

async function postExportsSizeMiddleware(req, res) {
  const { name, version, result } = req.body

  if (!name || !version || !result) return res.code(422).send()

  debug('set exports %O to %O', { name, version }, result)
  LRUCache.set(getMemoryKey(name, version), result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (err) {
    console.log(err)
    return res.code(500).send({ error: err })
  }
}

module.exports = { getExportsSizeMiddlware, postExportsSizeMiddleware }
