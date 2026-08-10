import type { FastifyReply, FastifyRequest } from 'fastify'
import LRU from 'lru-cache'

type CacheEntry = unknown
type CacheRequest = FastifyRequest<{
  Querystring: { key?: string }
  Body: { key?: string; result?: CacheEntry; ttlMs?: number }
}>

const MAX_ENTRIES = 500
const MAX_TTL_MS = 24 * 60 * 60 * 1000

function getKey(request: CacheRequest) {
  const key = request.method === 'GET' ? request.query.key : request.body?.key
  return typeof key === 'string' ? key : ''
}

function getTtlMs(request: CacheRequest) {
  const ttlMs = Number(request.body?.ttlMs)
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return null
  return Math.min(ttlMs, MAX_TTL_MS)
}

export function createTrendsCacheMiddleware() {
  // Each data source has an independent LRU budget and expiry policy.
  const cache = new LRU<string, CacheEntry>({ max: MAX_ENTRIES })

  return {
    async get(request: CacheRequest, reply: FastifyReply) {
      const key = getKey(request)
      if (!key) return reply.code(422).send()

      const result = cache.get(key)
      if (result === undefined) return reply.code(404).send()

      return reply.code(200).send(result)
    },

    async post(request: CacheRequest, reply: FastifyReply) {
      const key = getKey(request)
      const ttlMs = getTtlMs(request)
      if (!key || ttlMs === null) return reply.code(422).send()

      cache.set(key, request.body.result, ttlMs)
      return reply.code(201).send()
    },
  }
}
