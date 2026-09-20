import {
  type CacheObject,
  type CacheValue,
  parseCacheKey,
  parseCacheRequestBody,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { CacheRepository } from './cache.repository.ts'

interface CacheRouteDefinition<T> {
  label: string
  repository: CacheRepository
  parseResult(value: CacheValue): T | null
}

type CacheReadRequest = FastifyRequest<{ Querystring: CacheObject }>

type CacheWriteRequest = FastifyRequest<{ Body: CacheObject }>

export function createCacheHandlers<T>({
  label,
  repository,
  parseResult,
}: CacheRouteDefinition<T>) {
  async function get(request: CacheReadRequest, reply: FastifyReply) {
    const key = parseCacheKey(request.query)

    if (!key) {
      return reply.code(422).send({
        error: { code: 'INVALID_CACHE_KEY' },
      })
    }

    try {
      const result = await repository.get(key)

      if (result === null) {
        return reply.code(404).send()
      }

      const parsedResult = parseResult(result)

      if (parsedResult === null) {
        request.log.error({ label, key }, 'Invalid cached result')

        return reply.code(500).send({
          error: { code: 'INVALID_CACHE_RESULT' },
        })
      }

      return reply.code(200).send(parsedResult)
    } catch (error) {
      request.log.error({ err: error, label, key }, 'Cache read failed')

      return reply.code(503).send({
        error: { code: 'CACHE_BACKEND_UNAVAILABLE' },
      })
    }
  }

  async function post(request: CacheWriteRequest, reply: FastifyReply) {
    const body = parseCacheRequestBody(request.body)

    if (!body || parseResult(body.result) === null) {
      return reply.code(422).send({
        error: { code: 'INVALID_CACHE_REQUEST' },
      })
    }

    const key: CacheKey = { name: body.name, version: body.version }

    try {
      await repository.set(key, body.result)

      return reply.code(201).send()
    } catch (error) {
      request.log.error({ err: error, label, key }, 'Cache write failed')

      return reply.code(503).send({
        error: { code: 'CACHE_BACKEND_UNAVAILABLE' },
      })
    }
  }

  return { get, post }
}
