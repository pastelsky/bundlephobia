import type { Middleware } from 'koa'
import now from 'performance-now'

import logger from '../Logger'
import { recordRequestComplete, recordRequestStart } from '../MemoryDiagnostics'

const API_ROUTES = new Set([
  '/api/exports',
  '/api/exports-sizes',
  '/api/mcp/call-tool',
  '/api/mcp/tools',
  '/api/package-history',
  '/api/recent',
  '/api/similar-packages',
  '/api/size',
  '/api/stats-image',
])

function normalizeRoute(path: string): string {
  if (path.startsWith('/api/')) {
    return API_ROUTES.has(path) ? path : '/api/*'
  }
  if (path.startsWith('/package/')) {
    return '/package/*'
  }
  if (path.startsWith('/_next/')) {
    return '/_next/*'
  }
  if (path.startsWith('/-/search')) {
    return '/-/search'
  }
  return path === '/' ? '/' : 'other'
}

const requestLoggerMiddleware: Middleware = async (ctx, next) => {
  const requestStart = now()
  recordRequestStart()

  try {
    await next()
  } finally {
    const requestEnd = now()
    const time = requestEnd - requestStart
    recordRequestComplete({
      route: normalizeRoute(ctx.path),
      status: ctx.response.status,
      durationMs: time,
    })

    if (ctx.request.url.includes('/api/')) {
      logger.info(
        'REQUEST',
        {
          url: ctx.request.url,
          type: ctx.request.type,
          query: ctx.request.query,
          headers: ctx.request.headers,
          ip:
            ctx.request.header['x-koaip'] ||
            ctx.request.header['cf-connecting-ip'] ||
            ctx.ip,
          requestId: ctx.state.id,
          method: ctx.request.method,
          origin: ctx.request.origin,
          hostname: ctx.request.hostname,
          status: ctx.response.status,
          time,
          language: ctx.state.analysis?.language,
          operation: ctx.state.analysis?.operation,
        },
        `REQUEST: ${ctx.response.status} ${(time / 1000).toFixed(2)}s ${
          ctx.req.method
        } ${ctx.request.url}`
      )
    }
  }
}

export default requestLoggerMiddleware
