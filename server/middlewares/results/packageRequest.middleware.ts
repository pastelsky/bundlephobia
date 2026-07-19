import type { Middleware } from 'koa'

import { createRequestedPackage } from '../../services/packageResolution.service'

const packageRequestMiddleware: Middleware = async (ctx, next) => {
  const packageQuery = ctx.query.package
  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')
    return
  }

  const requestedPackage = createRequestedPackage(packageString)
  ctx.state.requestedPackage = requestedPackage
  ctx.state.packageRequestPolicy = {
    forceBuild: ctx.query.force !== undefined,
    cacheOnly: ctx.query.peep !== undefined,
    peekOnly: ctx.query.peek !== undefined,
  }
  await next()
}

export default packageRequestMiddleware
