import type { Middleware } from 'koa'
import semver from 'semver'

import { PackageCacheMode } from '../../../utils/packageApi.utils'
import config from '../../config'
import { debug, failureCache } from '../../init'
import logger from '../../Logger'
import { requireResolvedPackage } from '../../services/packageResolution.service'

// Serves koa-cash and failure-cache entries for endpoint-specific JSON caches.
// Force-rebuild bypasses reads; cache-only misses stop with HTTP 404.
const jsonCacheResponseMiddleware: Middleware = async (ctx, next) => {
  const { cacheMode } = ctx.state.packageRequest
  if (cacheMode === PackageCacheMode.ForceRebuild) {
    await next()
    return
  }

  const { name, version, packageString } = requireResolvedPackage(
    ctx.state.resolvedPackage
  )

  const cached = await ctx.cashed()
  if (cached) {
    ctx.cacheControl = {
      maxAge: semver.valid(version)
        ? config.CACHE.SIZE_API_HAS_VERSION
        : config.CACHE.SIZE_API_DEFAULT,
    }

    logCache(true)
    return
  }

  const failureCacheEntry = failureCache.get(packageString)
  if (failureCacheEntry) {
    debug('fetched %s from failure cache', packageString)
    ctx.status = failureCacheEntry.status
    ctx.body = failureCacheEntry.body
    logCache(true, 'failure')
    return
  }

  logCache(false)

  if (cacheMode === PackageCacheMode.CacheOnly) {
    ctx.status = 404
    return
  }

  await next()

  function logCache(hit: boolean, type?: 'failure'): void {
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
}

export default jsonCacheResponseMiddleware
