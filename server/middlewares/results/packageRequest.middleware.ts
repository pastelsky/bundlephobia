import type { Middleware } from 'koa'

import { isPackageCacheMode } from '../../../utils/packageApi.utils'
import { createPackageRequest } from '../../services/packageResolution.service'

// Parses and validates the package request once at the HTTP boundary.
// Downstream middleware consumes only this normalized request state.
const packageRequestMiddleware: Middleware = async (ctx, next) => {
  const packageQuery = ctx.query.package
  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')
    return
  }

  const cacheQuery = ctx.query.cache
  const cacheMode = cacheQuery === undefined ? 'cache-first' : cacheQuery

  if (!isPackageCacheMode(cacheMode)) {
    ctx.throw(400, 'cache must be cache-first, force-rebuild, or cache-only')
    return
  }

  ctx.state.packageRequest = createPackageRequest(packageString, cacheMode)
  await next()
}

export default packageRequestMiddleware
