import type { Context, Middleware } from 'koa'

interface BuildMissRateLimitOptions {
  durationMs?: number
  maxRequests?: number
  whiteList?: string[]
  message429?: string
}

interface RateLimitEntry {
  resetAt: number
  count: number
}

interface LruCacheInstance<K, V> {
  itemCount: number
  get(key: K): V | undefined
  set(key: K, value: V): this
  del(key: K): void
}

interface LruCacheConstructor {
  new <K, V>(options: { max: number; maxAge: number }): LruCacheInstance<K, V>
}

// SAFETY: the pinned lru-cache module implements the constructor contract above.
const LRU = require('lru-cache') as LruCacheConstructor

const DEFAULT_DURATION_MS = 1000 * 60 * 5

const DEFAULT_MAX_REQUESTS = 10

const DEFAULT_MESSAGE = '429: Too Many Build Requests.'

function getClientIp(ctx: Context): string {
  const rawIp =
    ctx.request.header['cf-connecting-ip'] ||
    ctx.ip

  return Array.isArray(rawIp) ? rawIp[0] : rawIp || ''
}

export default function buildMissRateLimit(
  options: BuildMissRateLimitOptions = {},
): Middleware {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  const whiteList = new Set(options.whiteList ?? ['127.0.0.1', '::1'])
  const message429 = options.message429 ?? DEFAULT_MESSAGE

  const db = new LRU<string, RateLimitEntry>({
    max: 10_000,
    maxAge: durationMs,
  })

  return async (ctx, next) => {
    // Registered after cache lookup: hits return before reaching this guard.
    // HAProxy owns completed-time accounting; a miss consumes its budget signal
    // and the shared admission allowance without reclassifying the caller.
    if (ctx.get('X-Bundlephobia-Build-Budget-Exceeded') === 'true') {
      ctx.set('Retry-After', '300')
      ctx.status = 429
      ctx.body = message429

      return
    }

    if (ctx.method === 'OPTIONS') {
      await next()

      return
    }

    const ip = getClientIp(ctx)

    if (!ip || whiteList.has(ip)) {
      await next()

      return
    }

    const now = Date.now()
    const current = db.get(ip)

    let entry: RateLimitEntry

    if (!current || current.resetAt <= now) {
      entry = {
        resetAt: now + durationMs,
        count: 1,
      }
    } else {
      current.count += 1
      entry = current
    }

    db.set(ip, entry)

    const remaining = Math.max(maxRequests - entry.count, 0)

    const retryAfterSeconds = Math.max(
      Math.trunc((entry.resetAt - now) / 1000),
      0,
    )

    ctx.set('X-BuildRateLimit-Limit', String(maxRequests))
    ctx.set('X-BuildRateLimit-Remaining', String(remaining))
    ctx.set('X-BuildRateLimit-Reset', String(entry.resetAt))

    if (entry.count > maxRequests) {
      ctx.set('Retry-After', String(retryAfterSeconds))
      ctx.status = 429
      ctx.body = message429

      return
    }

    await next()
  }
}
