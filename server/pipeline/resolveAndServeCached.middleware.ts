import type { Middleware } from 'koa'
import now from 'performance-now'

import type { PackageIdentity } from '../../types/package-domain'
import { debug, logger } from '../init'
import { getExactRequestedVersion } from '../services/packageResolution.service'
import { cachePolicy, sizeCacheMaxAge } from './cachePolicy'
import { logCache, serveFailureCache } from './cacheResponse'
import type { PackageResultCache } from './packageResultCache'
import { resolveCachedPackage } from './resolveCachedPackage'

/**
 * Resolves the requested package to an exact version and serves any cached
 * result — the shared step for every package API. A cache hit, a cached
 * failure, or a cache-only miss ends the request here; anything else falls
 * through to the build stage with `ctx.state.resolvedPackage` populated.
 */
export function resolveAndServeCached<TResult extends PackageIdentity>(
  cache: PackageResultCache<TResult> | null
): Middleware {
  return async (ctx, next) => {
    const request = ctx.state.packageRequest
    const startedAt = now()
    const { resolvedPackage, cachedResult } = await resolveCachedPackage(
      request,
      cache
    )
    const elapsed = now() - startedAt
    ctx.state.resolvedPackage = resolvedPackage

    debug('resolved to %s', resolvedPackage.packageString)
    logger.info(
      'RESOLVE_PACKAGE',
      {
        ...resolvedPackage,
        cache: cachedResult === undefined ? 'cache-miss' : 'cache-hit',
        time: elapsed,
        requestId: ctx.state.id,
      },
      `RESOLVED: ${resolvedPackage.packageString} in ${elapsed.toFixed(0)}ms`
    )

    if (cachedResult !== undefined) {
      ctx.cacheControl = {
        maxAge: sizeCacheMaxAge(
          request.cacheMode,
          getExactRequestedVersion(request) !== null
        ),
      }
      ctx.body = cachedResult
      logCache(ctx, resolvedPackage, true)
      return
    }

    const policy = cachePolicy(request.cacheMode)

    // Cache-backed endpoints also serve cached failures and log the miss;
    // an uncached endpoint (exports) just resolves and continues.
    if (cache && policy.readsCache) {
      if (serveFailureCache(ctx, resolvedPackage)) {
        return
      }
      logCache(ctx, resolvedPackage, false)
    }

    if (policy.notFoundOnMiss) {
      ctx.status = 404
      return
    }

    await next()
  }
}
