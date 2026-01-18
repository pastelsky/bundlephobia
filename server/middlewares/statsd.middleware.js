const logger = require('../Logger')

async function statsdMiddleware(ctx, next) {
  const ip =
    ctx.request.header['x-koaip'] ||
    ctx.request.header['cf-connecting-ip'] ||
    ctx.ip
  let start = process.hrtime()

  logger.increment('request.count')
  logger.increment('request.' + ctx.method + '.count')
  logger.histogram('request.size', ctx.request.length)
  logger.set('request.addresses', ip)

  await next()
  //
  // let delta = process.hrtime(start)
  // // Format to high resolution time with nano time
  // delta = delta[0] * 1000 + delta[1] / 1000000;
  // logger.timing('request.duration', delta)
}

module.exports = statsdMiddleware
