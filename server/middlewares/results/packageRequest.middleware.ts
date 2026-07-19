import type { Middleware } from 'koa'

import {
  isPackageCacheMode,
  PackageCacheMode,
} from '../../../utils/packageApi.utils'
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
  const forceQuery = ctx.query.force

  if (cacheQuery !== undefined && forceQuery !== undefined) {
    ctx.throw(400, 'cache and force query parameters cannot be combined')
    return
  }

  // `force` is the sole legacy query parameter retained for public API users.
  // Presence matches the old behavior; all internal state uses the enum.
  const cacheMode =
    forceQuery !== undefined
      ? PackageCacheMode.ForceRebuild
      : cacheQuery ?? PackageCacheMode.CacheFirst

  if (!isPackageCacheMode(cacheMode)) {
    ctx.throw(400, 'cache must be cache-first, force-rebuild, or cache-only')
    return
  }

  ctx.state.packageRequest = createPackageRequest(packageString, cacheMode)
  await next()
}

export default packageRequestMiddleware
