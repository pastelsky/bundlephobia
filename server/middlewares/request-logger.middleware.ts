import type { Middleware } from 'koa'
import now from 'performance-now'

import logger, { withRequestLogContext } from '../infrastructure/logger.service'
import {
  getAnalysisClientType,
  getAnalysisClientFamily,
} from '../infrastructure/request-metrics'
import {
  recordRequestComplete,
  recordRequestStart,
} from '../infrastructure/memory-diagnostics.service'

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

interface RequestMetric {
  route: string
  status: number
  durationMs: number
}

export interface RequestLoggerDependencies {
  recordRequestStart: () => void
  recordRequestComplete: (request: RequestMetric) => void
  logger: Pick<typeof logger, 'info'>
}

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

export function createRequestLoggerMiddleware(
  dependencies: RequestLoggerDependencies = {
    recordRequestStart,
    recordRequestComplete,
    logger,
  },
): Middleware {
  return async (ctx, next) => {
    const requestStart = now()
    dependencies.recordRequestStart()

    const handleRequest = async () => {
      try {
        await next()
      } finally {
        const requestEnd = now()
        const time = requestEnd - requestStart
        dependencies.recordRequestComplete({
          route: normalizeRoute(ctx.path),
          status: ctx.response.status,
          durationMs: time,
        })

        if (ctx.request.url.includes('/api/')) {
          dependencies.logger.info(
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
              ...ctx.state.analysis,
            },
            `REQUEST: ${ctx.response.status} ${(time / 1000).toFixed(2)}s ${
              ctx.req.method
            } ${ctx.request.url}`,
          )
        }
      }
    }

    if (!ctx.request.url.includes('/api/')) return handleRequest()

    return withRequestLogContext(
      {
        requestId: ctx.state.id,
        userAgent: ctx.get('User-Agent').slice(0, 512),
        clientType: getAnalysisClientType(
          ctx.get('X-Bundlephobia-Client-Type'),
        ),
        clientFamily: getAnalysisClientFamily(
          ctx.get('X-Bundlephobia-Client-Family'),
        ),
        source:
          ctx.get('X-Bundlephobia-Prefer-Cached') === 'true'
            ? 'crawler-page'
            : 'api',
      },
      handleRequest,
    )
  }
}

const requestLoggerMiddleware = createRequestLoggerMiddleware()

export default requestLoggerMiddleware
