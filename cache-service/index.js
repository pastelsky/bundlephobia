require('dotenv-defaults').config()
const firebase = require('firebase')
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

fastify
  .listen({ port: 7001 })
  .then(() => {
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
