import type { Middleware } from 'koa'
import now from 'performance-now'

import logger from '../Logger'

const requestLoggerMiddleware: Middleware = async (ctx, next) => {
  if (!ctx.request.url.includes('/api/')) {
    await next()
    return
  }

  const requestStart = now()
  await next()
  const requestEnd = now()
  const time = requestEnd - requestStart

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
    },
    `REQUEST: ${ctx.response.status} ${(time / 1000).toFixed(2)}s ${
      ctx.req.method
    } ${ctx.request.url}`
  )
}

export default requestLoggerMiddleware
