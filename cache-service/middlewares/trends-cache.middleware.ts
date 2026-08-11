import createDebug from 'debug'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { LRUCache } from 'lru-cache'

import type { CacheEntry } from '../types.ts'

const debug = createDebug('bp:cache')
const MAX_ENTRIES = 500
const MAX_TTL_MS = 24 * 60 * 60 * 1000

type CacheRequest<TQuery, TBody> = FastifyRequest<{
  Querystring: TQuery
}> & { body: TBody }

export interface CachePayload {
  result?: CacheEntry
}

export interface DownloadsPayload extends CachePayload {
  packageName?: string
  range?: string
}

export interface GithubHistoryPayload extends CachePayload {
  repository?: string
  range?: string
  source?: 'history' | 'snapshot' | 'stars'
}

export interface PackagePayload extends CachePayload {
  packageName?: string
}

function createCache<TQuery, TBody extends CachePayload>(
  ttlMs: number,
  getKey: (request: CacheRequest<TQuery, TBody>) => string | undefined,
) {
  const cache = new LRUCache<string, CacheEntry>({ max: MAX_ENTRIES })

  return {
    async get(request: CacheRequest<TQuery, TBody>, reply: FastifyReply) {
      const key = getKey(request)
      if (!key) return reply.code(422).send()

      const result = cache.get(key)
      if (result === undefined) return reply.code(404).send()

      return reply.code(200).send(result)
    },

    async post(request: CacheRequest<TQuery, TBody>, reply: FastifyReply) {
      const key = getKey(request)
      const result = request.body.result
      if (!key || result === undefined) return reply.code(422).send()

      cache.set(key, result, { ttl: Math.min(ttlMs, MAX_TTL_MS) })
      debug('set trends cache %s', key)
      return reply.code(201).send()
    },
  }
}

export function createDownloadsCache(ttlMs: number) {
  return createCache<DownloadsPayload, DownloadsPayload>(
    ttlMs,
    ({ query, body }) => {
      const packageName = query.packageName || body.packageName
      const range = query.range || body.range
      return packageName && range ? `${packageName}:${range}` : undefined
    },
  )
}

export function createGithubHistoryCache(ttlMs: number) {
  return createCache<GithubHistoryPayload, GithubHistoryPayload>(
    ttlMs,
    ({ query, body }) => {
      const repository = query.repository || body.repository
      const source = query.source || body.source
      const range = query.range || body.range || ''
      return repository && source
        ? `${source}:${repository}:${range}`
        : undefined
    },
  )
}

export function createReleasesCache(ttlMs: number) {
  return createCache<PackagePayload, PackagePayload>(
    ttlMs,
    ({ query, body }) => query.packageName || body.packageName,
  )
}

export function createSizeHistoryCache(ttlMs: number) {
  return createCache<PackagePayload, PackagePayload>(
    ttlMs,
    ({ query, body }) => query.packageName || body.packageName,
  )
}
