import type { Middleware } from 'koa'

interface IpCheckerModule {
  check(ip: string, map: Record<string, unknown>): boolean
  map(list?: string[] | string): Record<string, unknown>
}

interface RateLimitOptions {
  duration?: number
  whiteList?: string[]
  blackList?: string[]
  accessLimited?: string
  accessForbidden?: string
  max?: number
  env?: string | null
  message_429?: string
  message_403?: string
}

interface RateLimitState {
  ip: string
  reset: number
  limit: number
}

const ipchecker = require('ipchecker') as IpCheckerModule

const defaults = {
  duration: 1000 * 60 * 60,
  whiteList: [],
  blackList: [],
  accessLimited: '429: Too Many Requests.',
  accessForbidden: '403: This is forbidden area for you.',
  max: 100,
  env: null,
} satisfies Required<Omit<RateLimitOptions, 'message_429' | 'message_403'>>

export default function betterlimit(
  options: RateLimitOptions = {}
): Middleware {
  const resolvedOptions = {
    ...defaults,
    ...options,
  }

  if (resolvedOptions.message_429) {
    resolvedOptions.accessLimited = resolvedOptions.message_429
  }

  if (resolvedOptions.message_403) {
    resolvedOptions.accessForbidden = resolvedOptions.message_403
  }

  const whiteListMap = ipchecker.map(resolvedOptions.whiteList)
  const blackListMap = ipchecker.map(resolvedOptions.blackList)
  const db: Record<string, RateLimitState> = {}

  const rateLimitMiddleware: Middleware = async (ctx, next) => {
    const rawIp =
      ctx.request.header['x-koaip'] ||
      ctx.request.header['cf-connecting-ip'] ||
      ctx.ip
    const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp

    if (!ip) {
      await next()
      return
    }

    if (ipchecker.check(ip, blackListMap)) {
      ctx.response.status = 403
      ctx.response.body = resolvedOptions.accessForbidden
      return
    }

    if (ipchecker.check(ip, whiteListMap)) {
      await next()
      return
    }

    const now = Date.now()
    const reset = now + resolvedOptions.duration

    if (!Object.prototype.hasOwnProperty.call(db, ip)) {
      db[ip] = { ip, reset, limit: resolvedOptions.max }
    }

    const entry = db[ip]
    const delta = entry.reset - now
    const retryAfter = Math.trunc(delta / 1000)

    entry.limit -= 1
    ctx.response.set('X-RateLimit-Limit', String(resolvedOptions.max))

    if (entry.reset > now) {
      const rateLimiting = entry.limit < 0 ? 0 : entry.limit
      ctx.response.set('X-RateLimit-Remaining', String(rateLimiting))
    }

    if (entry.limit < 0 && entry.reset < now) {
      db[ip] = { ip, reset, limit: resolvedOptions.max }
      db[ip].limit -= 1
      ctx.response.set('X-RateLimit-Remaining', String(db[ip].limit))
    }

    ctx.response.set('X-RateLimit-Reset', String(db[ip].reset))

    if (db[ip].limit < 0) {
      ctx.response.set('Retry-After', String(retryAfter))
      ctx.response.status = 429
      ctx.response.body = resolvedOptions.accessLimited
      return
    }

    await next()
  }

  return rateLimitMiddleware
}
