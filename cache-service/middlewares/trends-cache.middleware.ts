import createDebug from 'debug'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { LRUCache } from 'lru-cache'

import type { CacheEntry } from '../types.ts'

const debug = createDebug('bp:cache')
const MAX_ENTRIES = 500
const MAX_TTL_MS = 24 * 60 * 60 * 1000

type TrendsCacheRequest = FastifyRequest<{
  Querystring: { key?: string }
  Body: { key?: string; result?: CacheEntry }
}>

export function createTrendsCacheMiddleware(ttlMs: number) {
  const cache = new LRUCache<string, CacheEntry>({ max: MAX_ENTRIES })

  return {
    async get(request: TrendsCacheRequest, reply: FastifyReply) {
      const key = request.query.key
      if (!key) return reply.code(422).send()

      const result = cache.get(key)
      if (result === undefined) return reply.code(404).send()

      return reply.code(200).send(result)
    },

    async post(request: TrendsCacheRequest, reply: FastifyReply) {
      const { key, result } = request.body
      if (!key || result === undefined) {
        return reply.code(422).send()
      }

      cache.set(key, result, { ttl: Math.min(ttlMs, MAX_TTL_MS) })
      debug('set trends cache %s', key)
      return reply.code(201).send()
    },
  }
}
