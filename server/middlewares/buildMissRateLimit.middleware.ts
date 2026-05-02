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

const DEFAULT_DURATION_MS = 1000 * 60 * 5
const DEFAULT_MAX_REQUESTS = 10
const DEFAULT_MESSAGE = '429: Too Many Build Requests.'

function getClientIp(ctx: Context): string {
  const rawIp =
    ctx.request.header['x-koaip'] ||
    ctx.request.header['cf-connecting-ip'] ||
    ctx.ip
  return Array.isArray(rawIp) ? rawIp[0] : rawIp || ''
}

export default function buildMissRateLimit(
  options: BuildMissRateLimitOptions = {}
): Middleware {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  const whiteList = new Set(options.whiteList ?? ['127.0.0.1', '::1'])
  const message429 = options.message429 ?? DEFAULT_MESSAGE
  const db: Record<string, RateLimitEntry> = {}

  return async (ctx, next) => {
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
    const current = db[ip]

    if (!current || current.resetAt <= now) {
      db[ip] = {
        resetAt: now + durationMs,
        count: 1,
      }
    } else {
      current.count += 1
    }

    const entry = db[ip]
    const remaining = Math.max(maxRequests - entry.count, 0)
    const retryAfterSeconds = Math.max(
      Math.trunc((entry.resetAt - now) / 1000),
      0
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
