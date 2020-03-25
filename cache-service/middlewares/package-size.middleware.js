require('dotenv-defaults').config()
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const { encodeFirebaseKey } = require('../cache.utils')
const LRUCache = new LRU({ max: 3000 })

async function getPackageResult({ name, version }) {
  const ref = firebase
    .database()
    .ref()
    .child('modules-v2')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

async function setPackageResult({ name, version, result }) {
  const modules = firebase.database().ref().child('modules-v2')
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

async function getPackageSizeMiddlware(req, res) {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get package %s@%s', name, version)
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
