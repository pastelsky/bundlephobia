require('dotenv-defaults').config()
const LRU = require('lru-cache')
const firebase = require('firebase')
const debug = require('debug')('bp:cache')
const { encodeFirebaseKey } = require('../cache.utils')

const LRUCache = new LRU({ max: 1500 })

async function getPackageResult({ name, version }) {
  const ref = firebase
    .database()
    .ref()
    .child('exports')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

async function setPackageResult({ name, version, result }) {
  const modules = firebase.database().ref().child('exports')
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

async function getExportsSizeMiddlware(req, res) {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get exports %s@%s', name, version)
  const lruCacheEntry = LRUCache.get(`${name}@${version}`)

  if (lruCacheEntry) {
    debug('cache hit: memory')
    return res.code(200).send(lruCacheEntry)
  } else {
    const result = await getPackageResult({ name, version })
    if (result) {
      debug('cache hit: firebase')
      LRUCache.set(`${name}@${version}`, result)
      return res.code(200).send(result)
    }
  }
  return res.code(404).send()
}

async function postExportsSizeMiddleware(req, res) {
  const { name, version, result } = req.body

  if (!name || !version || !result) return res.code(422).send()

  debug('set exports %O to %O', { name, version }, result)
  LRUCache.set(`${name}@${version}`, result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (err) {
    console.log(err)
    return res.code(500).send({ error: err })
  }
}

module.exports = { getExportsSizeMiddlware, postExportsSizeMiddleware }
