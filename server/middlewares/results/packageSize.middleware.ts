import type { Context, Middleware } from 'koa'
import now from 'performance-now'

import { PackageCacheMode } from '../../../utils/packageApi.utils'
import config from '../../config'
import { debug, failureCache, logger } from '../../init'
import { getExactRequestedVersion } from '../../services/packageResolution.service'
import { packageSizeService } from '../../services/packageSize.service'
import { assertPackageRequestIsBuildable } from './blockBlacklist.middleware'

// Resolves one package through the size cache and serves every pre-build result.
// Only an allowed cache miss continues to the rate-limited build middleware.
const packageSizeMiddleware: Middleware = async (ctx, next) => {
  const startedAt = now()
  const { packageRequest } = ctx.state
  const cacheResult = await packageSizeService.findPackageSize(packageRequest)
  const { resolvedPackage } = cacheResult
  const time = now() - startedAt

  ctx.state.resolvedPackage = resolvedPackage

  debug('resolved to %s', resolvedPackage.packageString)
  logger.info(
    'RESOLVE_PACKAGE',
    {
      ...resolvedPackage,
      cache: cacheResult.kind,
      time,
      requestId: ctx.state.id,
    },
    `RESOLVED: ${resolvedPackage.packageString} in ${time.toFixed(0)}ms`
  )

  if (packageRequest.cacheMode === PackageCacheMode.ForceRebuild) {
    await next()
    return
  }

  // Preserve the historical order: resolve first, then enforce package policy
  // before serving either a successful or failed cached response.
  assertPackageRequestIsBuildable(packageRequest)

  if (cacheResult.kind === 'cache-hit') {
    ctx.cacheControl = {
      maxAge:
        getExactRequestedVersion(packageRequest) === null
          ? config.CACHE.SIZE_API_DEFAULT
          : config.CACHE.SIZE_API_HAS_VERSION,
    }
    ctx.body = cacheResult.result
    logCache(ctx, resolvedPackage, true)
    return
  }

  const failureCacheEntry = failureCache.get(resolvedPackage.packageString)
  if (failureCacheEntry) {
    debug('fetched %s from failure cache', resolvedPackage.packageString)
    ctx.status = failureCacheEntry.status
    ctx.body = failureCacheEntry.body
    logCache(ctx, resolvedPackage, true, 'failure')
    return
  }

  logCache(ctx, resolvedPackage, false)

  if (packageRequest.cacheMode === PackageCacheMode.CacheOnly) {
    ctx.status = 404
    return
  }

  await next()
}

function logCache(
  ctx: Context,
  resolvedPackage: {
    name: string
    version: string
    packageString: string
  },
  hit: boolean,
  type?: 'failure'
): void {
  const { name, version, packageString } = resolvedPackage
  const message = `${type === 'failure' ? 'FAILURE ' : ''}CACHE ${
    hit ? 'HIT' : 'MISS'
  }: ${packageString}`

  logger.info(
    'CACHE',
    {
      name,
      version,
      packageString,
      hit,
      ...(type === undefined ? {} : { type }),
      requestId: ctx.state.id,
    },
    message
  )
}

export default packageSizeMiddleware
