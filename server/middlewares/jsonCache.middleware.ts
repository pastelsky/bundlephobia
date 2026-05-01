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
  return koaCache({
    async get(key: string) {
      const parsedKey = JSON.parse(key) as TKey
      const value = await get(parsedKey)
      return {
        body: value,
        type: 'application/json',
      }
    },
    async set(key: string, value: CacheEnvelope) {
      const parsedKey = JSON.parse(key) as TKey
      await set(parsedKey, JSON.parse(value.body) as TValue)
    },
    hash(ctx) {
      return JSON.stringify(hashFn(ctx as unknown as Context))
    },
  }) as unknown as Middleware
}
