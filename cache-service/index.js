require('dotenv-defaults').config()
const firebase = require('firebase')
const LRU = require('lru-cache')
const debug = require('debug')('bp:cache')
const fastify = require('fastify')()
const {
  getPackageSizeMiddlware,
  postPackageSizeMiddlware,
} = require('./middlewares/package-size.middleware')
const {
  getExportsSizeMiddlware,
  postExportsSizeMiddleware,
} = require('./middlewares/exports-size.middleware')

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

fastify.get('/package-cache', getPackageSizeMiddlware)
fastify.post('/package-cache', postPackageSizeMiddlware)

fastify.get('/exports-cache', getExportsSizeMiddlware)
fastify.post('/exports-cache', postExportsSizeMiddleware)

fastify.listen(7001, '127.0.0.1', function (err) {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
