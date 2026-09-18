import 'dotenv-defaults/config.js'

import type { AddressInfo } from 'node:net'

import createFastify from 'fastify'
import firebase from 'firebase'

import {
  getExportsSizeMiddlware,
  postExportsSizeMiddleware,
} from './middlewares/exports-size.middleware.ts'
import {
  getPackageSizeMiddlware,
  postPackageSizeMiddlware,
} from './middlewares/package-size.middleware.ts'

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

fastify
  .listen({ port: 7001 })
  .then(() => {
    const address = fastify.server.address()

    if (
      !address ||
      Object.prototype.toString.call(address) === '[object String]'
    ) {
      throw new Error('cache service did not expose a TCP address')
    }

    // SAFETY: Fastify returns AddressInfo after the string-address guard above.
    const addressInfo = address as AddressInfo
    console.log(`server listening on ${addressInfo.port}`)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
