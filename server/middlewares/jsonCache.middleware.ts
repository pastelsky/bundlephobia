import koaCache from 'koa-cash'
import type { Context, Middleware } from 'koa'

interface CacheEnvelope {
  body: string
}

interface JsonCacheConfig<TKey, TValue> {
  get(key: TKey): Promise<TValue | undefined>
  set(key: TKey, value: TValue): void | Promise<void>
  hash(ctx: Context): TKey
}

export default function jsonCacheMiddleware<TKey, TValue>({
  get,
  set,
  hash: hashFn,
}: JsonCacheConfig<TKey, TValue>): Middleware {
  // SAFETY: koa-cash returns a middleware compatible with the server's Koa version.
  return koaCache({
    async get(key: string) {
      // SAFETY: cache keys are serialized by this middleware's hash function.
      const parsedKey = JSON.parse(key) as TKey
      const value = await get(parsedKey)

      return {
        body: value,
        type: 'application/json',
      }
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
}
