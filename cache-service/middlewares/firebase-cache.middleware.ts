import createDebug from 'debug'
import type { FastifyReply, FastifyRequest } from 'fastify'
import firebase from 'firebase'
import LRU from 'lru-cache'

import { encodeFirebaseKey } from '../../utils'

type CacheRequest = FastifyRequest<{
  Querystring: { name?: string; version?: string; readKey?: string }
  Body: { name?: string; version?: string; result?: unknown }
}>

interface FirebaseCacheConfig {
  label: string
  maxEntries: number
  readKey: string
  writeKey: string
  fallbackReadKey?: string
}

const debug = createDebug('bp:cache')

async function readFirebaseValue(
  namespace: string,
  name: string,
  version: string
) {
  const snapshot = await firebase
    .database()
    .ref()
    .child(namespace)
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .once('value')
  return snapshot.val() as unknown
}

/**
 * Creates the common memory-first, Firebase-backed cache used for package and
 * export results. Each configured route receives its own bounded LRU.
 */
export function createFirebaseCacheMiddleware(config: FirebaseCacheConfig) {
  const memoryCache = new LRU<string, unknown>({ max: config.maxEntries })

  async function read(
    name: string,
    version: string,
    requestedReadKey?: string
  ) {
    const activeReadKey = requestedReadKey || config.readKey
    const result = await readFirebaseValue(activeReadKey, name, version)
    if (result) return result

    if (
      config.fallbackReadKey &&
      activeReadKey === config.readKey &&
      !requestedReadKey
    ) {
      return readFirebaseValue(config.fallbackReadKey, name, version)
    }

    return null
  }

  return {
    async get(request: CacheRequest, reply: FastifyReply) {
      const name = decodeURIComponent(request.query.name || '')
      const version = decodeURIComponent(request.query.version || '')
      if (!name || !version) return reply.code(422).send()

      const cacheKey = `${name}@${version}`
      if (!request.query.readKey) {
        const cached = memoryCache.get(cacheKey)
        if (cached !== undefined) return reply.code(200).send(cached)
      }

      const result = await read(name, version, request.query.readKey)
      if (!result) return reply.code(404).send()

      if (!request.query.readKey) memoryCache.set(cacheKey, result)
      return reply.code(200).send(result)
    },

    async post(request: CacheRequest, reply: FastifyReply) {
      const { name, version, result } = request.body || {}
      if (!name || !version || !result) return reply.code(422).send()

      debug('set %s %O to %O', config.label, { name, version }, result)
      memoryCache.set(`${name}@${version}`, result)
      try {
        await firebase
          .database()
          .ref()
          .child(config.writeKey)
          .child(encodeFirebaseKey(name))
          .child(encodeFirebaseKey(version))
          .set(result)
        return reply.code(201).send()
      } catch (error) {
        return reply.code(500).send({ error })
      }
    },
  }
}
