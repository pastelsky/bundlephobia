require('dotenv').config()
require('now-logs')('bundlephobia')
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const server = require('server')
const { status } = server.reply;
const { get, post } = server.router;

const LRUCache = LRU({ max: 10000 })

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL
}

firebase.initializeApp(firebaseConfig)

function encodeFirebaseKey(key) {
  return key
    .replace(/[.]/g, ',')
    .replace(/\//g, '__')
}

async function getFirebaseStore() {
  try {
    const snapshot = await firebase.database()
      .ref('modules-v2')
      .once('value')
    return snapshot.val()
  } catch (err) {
    console.log(err)
    return {}
  }
}

async function getPackageResult({ name, version }) {
  const ref = firebase.database().ref()
    .child('modules-v2')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

async function setPackageResult({ name, version, result}) {
  const modules = firebase.database().ref().child('modules-v2')
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

async function loadStoreToCache() {
  const store = await getFirebaseStore()
  let totalItemCount = 0
  Object.keys(store).forEach((pack) => {
    Object.keys(store[pack]).forEach((version) => {
      const instance = store[pack][version]
      totalItemCount++
      LRUCache.set(`${instance.name}@${instance.version}`, store[pack][version])
    })
  })
  debug('loaded %d out of %d entries into memory cache', LRUCache.itemCount, totalItemCount)
}

try {
  loadStoreToCache()
} catch (err) {
  console.log('Load error: ', err)
}

server({ port: 7000, security: { csrf: false } }, [
  get('/cache', async ctx => {
    const name = decodeURIComponent(ctx.query.name)
    const version = decodeURIComponent(ctx.query.version)

    if (!name || !version) {
      return status(422)
    }
    debug('get %s@%s', name, version)
    const lruCacheEntry = LRUCache.get(`${name}@${version}`)

    if (lruCacheEntry) {
      debug('cache hit: memory')
      return status(200).send(lruCacheEntry)
    } else {
      const result = await getPackageResult({ name, version })
      if (result) {
        debug('cache hit: firebase')
        LRUCache.set(`${name}@${version}`, result)
        return status(200).send(result)
      }
    }
    return status(404)
  }),

  post('/cache', async ctx => {
    const { name, version, result } = ctx.data

    if (!name || !version || !result)
      return status(422)

    debug('set %O to %O', { name, version }, result)
    LRUCache.set(`${name}@${version}`, result)
    try {
      await setPackageResult({ name, version, result })
      return status(201)
    } catch(err) {
      console.log(err)
      return status(500).send({ error: err })
    }
  })
]);

