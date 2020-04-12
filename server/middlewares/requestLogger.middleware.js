const logger = require('../Logger')
const now = require('performance-now')

async function requestLoggerMiddleware(ctx, next) {
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
    `REQUEST: ${ctx.response.status}${time.toFixed(0)} ms ${ctx.req.method} ${
      ctx.request.url
    }`
  )
}

module.exports = requestLoggerMiddleware
