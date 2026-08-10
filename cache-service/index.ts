import 'dotenv-defaults/config.js'

import createFastify from 'fastify'
import firebase from 'firebase'

import type { TrendsCacheName } from '../types/cache-domain.ts'
import {
  getExportsSizeMiddlware,
  postExportsSizeMiddleware,
} from './middlewares/exports-size.middleware.ts'
import {
  getPackageSizeMiddlware,
  postPackageSizeMiddlware,
} from './middlewares/package-size.middleware.ts'
import { createTrendsCacheMiddleware } from './middlewares/trends-cache.middleware.ts'

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

const trendsCacheNames: TrendsCacheName[] = [
  'downloads',
  'github-history',
  'releases',
  'size-history',
]

for (const cacheName of trendsCacheNames) {
  const middleware = createTrendsCacheMiddleware()
  fastify.get(`/trends-cache/${cacheName}`, middleware.get)
  fastify.post(`/trends-cache/${cacheName}`, middleware.post)
}

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
