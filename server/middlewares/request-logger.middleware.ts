import type { Middleware } from 'koa'
import now from 'performance-now'

import logger from '../infrastructure/logger.service'

export interface RequestLoggerDependencies {
  logger: Pick<typeof logger, 'info'>
}

export function createRequestLoggerMiddleware(
  dependencies: RequestLoggerDependencies = {
    logger,
  },
): Middleware {
  return async (ctx, next) => {
    const requestStart = now()

    try {
      await next()
    } finally {
      const requestEnd = now()
      const time = requestEnd - requestStart

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
            language: ctx.state.analysis?.language,
            operation: ctx.state.analysis?.operation,
          },
          `REQUEST: ${ctx.response.status} ${(time / 1000).toFixed(2)}s ${
            ctx.req.method
          } ${ctx.request.url}`,
        )
      }
    }
  }
}

const requestLoggerMiddleware = createRequestLoggerMiddleware()

export default requestLoggerMiddleware
