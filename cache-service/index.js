require('dotenv-defaults').config()
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const fastify = require('fastify')()

const LRUCache = LRU({ max: 1500 })

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
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

async function setPackageResult({ name, version, result }) {
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
  //loadStoreToCache()
} catch (err) {
  console.log('Load error: ', err)
}

fastify.get('/cache', async (req, res) => {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get %s@%s', name, version)
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
})

fastify.post('/cache', async (req, res) => {
  const { name, version, result } = req.body

  if (!name || !version || !result)
    return res.code(422).send()

  debug('set %O to %O', { name, version }, result)
  LRUCache.set(`${name}@${version}`, result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (err) {
    console.log(err)
    return res.code(500).send({ error: err })
  }
})

fastify.listen(7001, '127.0.0.1', function (err) {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
