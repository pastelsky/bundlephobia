import type { Middleware } from 'koa'

import {
  createPendingPackageResolution,
  createRequestedPackage,
} from '../../packageRequest'

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
  ctx.state.resolved = createPendingPackageResolution(requestedPackage)

  await next()
}

export default packageRequestMiddleware
