import type { FastifyRequest } from 'fastify'

export type CachePrimitive = string | number | boolean | null

export interface CacheObject {
  [key: string]: CacheValue
}

export type CacheValue = CachePrimitive | CacheObject | CacheValue[]

export type CacheEntry = Exclude<CacheValue, null>

export interface CacheKey {
  name: string
  version: string
}

export interface CacheRequestBody extends CacheKey {
  result: CacheValue
}

export type CacheRequest = FastifyRequest<{
  Querystring: CacheKey & { readKey?: string }
  Body: CacheRequestBody
}>

export function readCacheSnapshot<T extends CacheEntry>(snapshot: {
  val(): T | null
}) {
  return snapshot.val()
}
