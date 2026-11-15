import 'dotenv-defaults/config.js'

import type { AddressInfo } from 'node:net'

import { CACHE_ROUTE } from '@bundlephobia/service-contracts/cache'

import createFastify from 'fastify'
import firebase from 'firebase'

import {
  getExportsSizeMiddleware,
  postExportsSizeMiddleware,
} from './middlewares/exports-size.middleware.ts'
import {
  getPackageSizeMiddleware,
  postPackageSizeMiddleware,
} from './middlewares/package-size.middleware.ts'

const fastify = createFastify()

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

fastify.get(CACHE_ROUTE.package, getPackageSizeMiddleware)

fastify.post(CACHE_ROUTE.package, postPackageSizeMiddleware)

fastify.get(CACHE_ROUTE.exports, getExportsSizeMiddleware)

fastify.post(CACHE_ROUTE.exports, postExportsSizeMiddleware)

fastify
  .listen({ host: '127.0.0.1', port: 7001 })
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

    if (process.send) {
      process.send('ready')
    }
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

let isShuttingDown = false

const gracefulShutdown = async () => {
  if (isShuttingDown) return
  isShuttingDown = true

  try {
    await fastify.close()
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.once('SIGINT', gracefulShutdown)

process.once('SIGTERM', gracefulShutdown)
