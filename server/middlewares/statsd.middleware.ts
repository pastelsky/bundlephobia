import type { Middleware } from 'koa'

import logger from '../Logger'

const statsdMiddleware: Middleware = async (ctx, next) => {
  const rawIp =
    ctx.request.header['x-koaip'] ||
    ctx.request.header['cf-connecting-ip'] ||
    ctx.ip
  const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp

  logger.increment('request.count')
  logger.increment(`request.${ctx.method}.count`)
  logger.histogram('request.size', ctx.request.length ?? 0)
  logger.set('request.addresses', ip)

  await next()
}

export default statsdMiddleware
