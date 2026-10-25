import koaCache from 'koa-cash'
import type { Context, Middleware } from 'koa'

import type { CacheReadResult } from '@bundlephobia/service-contracts/cache'

interface CacheEnvelope {
  body: string
}

interface JsonCacheConfig<TKey, TValue> {
  get(key: TKey): Promise<CacheReadResult<TValue>>
  set(key: TKey, value: TValue): void | Promise<void>
  hash(ctx: Context): TKey
  onReadFailure?(
    result: Exclude<CacheReadResult<TValue>, { status: 'hit' | 'miss' }>,
  ): void
}

export default function jsonCacheMiddleware<TKey, TValue>({
  get,
  set,
  hash: hashFn,
  onReadFailure,
}: JsonCacheConfig<TKey, TValue>): Middleware {
  // SAFETY: koa-cash uses a duplicate Koa type package but the same runtime context.
  const middleware = koaCache({
    // Cloudflare compresses responses; the store only keeps JSON, not gzip bodies.
    threshold: Infinity,
    async get(key: string) {
      // SAFETY: cache keys are serialized by this middleware's hash function.
      const parsedKey = JSON.parse(key) as TKey
      const result = await get(parsedKey)

      if (result.status === 'hit') {
        return {
          body: result.value,
          type: 'application/json',
        }
      }

      if (result.status !== 'miss') {
        onReadFailure?.(result)
      }

      return undefined
    },
    async set(key: string, value: CacheEnvelope) {
      // SAFETY: cache keys and bodies are serialized by this middleware.
      const parsedKey = JSON.parse(key) as TKey
      const parsedBody = JSON.parse(value.body)
      // SAFETY: cache bodies are serialized by this middleware's get function.
      const typedBody = parsedBody as TValue
      await set(parsedKey, typedBody)
    },
    hash(ctx) {
      // SAFETY: koa-cash supplies the configured Koa context shape.
      const cacheContext = ctx as Context & typeof ctx

      return JSON.stringify(hashFn(cacheContext))
    },
  }) as Middleware & ReturnType<typeof koaCache>

  return async (ctx, next) => {
    await middleware(ctx, next)

    // koa-cash emits identity on hits and misses, preventing edge compression.
    if (ctx.response.get('Content-Encoding') === 'identity') {
      ctx.remove('Content-Encoding')
    }
  }
}
