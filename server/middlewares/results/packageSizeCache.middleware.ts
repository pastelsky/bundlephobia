import type { Middleware } from 'koa'
import now from 'performance-now'

import { debug, logger } from '../../init'
import { packageSizeService } from '../../services/packageSize.service'

// Resolves a package through the size cache without triggering a build.
// Stores one cache hit or miss for the response and build stages.
const packageSizeCacheMiddleware: Middleware = async (ctx, next) => {
  const startedAt = now()
  const cacheResult = await packageSizeService.findPackageSize(
    ctx.state.packageRequest
  )
  const time = now() - startedAt

  ctx.state.resolvedPackage = cacheResult.resolvedPackage
  ctx.state.packageSizeCache = cacheResult

  debug('resolved to %s', cacheResult.resolvedPackage.packageString)
  logger.info(
    'RESOLVE_PACKAGE',
    {
      ...cacheResult.resolvedPackage,
      cache: cacheResult.kind,
      time,
      requestId: ctx.state.id,
    },
    `RESOLVED: ${cacheResult.resolvedPackage.packageString} in ${time.toFixed(
      0
    )}ms`
  )

  await next()
}

export default packageSizeCacheMiddleware
