import 'dotenv-defaults/config.js'

import type { AddressInfo } from 'node:net'

import {
  CACHE_ROUTE,
  parsePackageCacheResult,
  parseExportsCacheResult,
  parseNamedExportsCacheResult,
  parseEntryPointsCacheResult,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'

import createFastify from 'fastify'
import firebase from 'firebase'

import { cacheConfig } from './cache.config.ts'
import { createCacheHandlers } from './cache.handlers.ts'
import { createCacheRepository } from './cache.repository.ts'

const fastify = createFastify()

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

const parsers = {
  package: parsePackageCacheResult,
  exports: parseExportsCacheResult,
  namedExports: parseNamedExportsCacheResult,
  entryPoints: parseEntryPointsCacheResult,
}

// SAFETY: CACHE_ROUTE is a closed shared-contract object with these exact keys.
for (const label of Object.keys(CACHE_ROUTE) as (keyof typeof CACHE_ROUTE)[]) {
  const handlers = createCacheHandlers<CacheKey>({
    label,
    repository: createCacheRepository(cacheConfig[label]),
    parseResult: parsers[label],
  })

  fastify.get(CACHE_ROUTE[label], handlers.get)
  fastify.post(CACHE_ROUTE[label], handlers.post)
}

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
