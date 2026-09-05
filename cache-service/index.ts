import 'dotenv-defaults/config.js'

import createFastify from 'fastify'
import firebase from 'firebase'

import { TRENDS_CACHE_NAMES } from '../types/cache-domain'
import {
  getExportsSizeMiddlware,
  postExportsSizeMiddleware,
} from './middlewares/exports-size.middleware.ts'
import {
  getPackageSizeMiddlware,
  postPackageSizeMiddlware,
} from './middlewares/package-size.middleware.ts'
import { createTrendsCacheMiddleware } from './middlewares/trends-cache.middleware'

const fastify = createFastify()

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

TRENDS_CACHE_NAMES.forEach(name => {
  const middleware = createTrendsCacheMiddleware()
  fastify.get(`/trends-cache/${name}`, middleware.get)
  fastify.post(`/trends-cache/${name}`, middleware.post)
})

fastify
  .listen({ port: 7001 })
  .then(() => {
    const address = fastify.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('cache service did not expose a TCP address')
    }
    console.log(`server listening on ${address.port}`)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
