import type { Context } from 'koa'

import { PackageCacheMode } from '../../../utils/packageApi.utils'
import config from '../../config'
import { debug, failureCache } from '../../init'
import logger from '../../Logger'

// Small helpers shared by the size / exports / exports-sizes middlewares.
// Deliberately leaf-level: policy + TTL + logging, no orchestration.

interface CachedPackage {
  name: string
  version: string
  packageString: string
}

/** What each cache mode is allowed to do; the one place the enum is read. */
export function cachePolicy(mode: PackageCacheMode) {
  return {
    readsCache: mode !== PackageCacheMode.ForceRebuild,
    notFoundOnMiss: mode === PackageCacheMode.CacheOnly,
    bypassesBlocklist: mode === PackageCacheMode.ForceRebuild,
  }
}

/** TTL for a successful size / exports response. */
export function sizeCacheMaxAge(
  mode: PackageCacheMode,
  hasExactVersion: boolean
): number {
  if (mode === PackageCacheMode.ForceRebuild) {
    return 0
  }
  return hasExactVersion
    ? config.CACHE.SIZE_API_HAS_VERSION
    : config.CACHE.SIZE_API_DEFAULT
}

/** TTL for an error response; force-rebuild never caches a failure. */
export function errorCacheMaxAge(
  mode: PackageCacheMode,
  baseTtl: number
): number {
  return mode === PackageCacheMode.ForceRebuild ? 0 : baseTtl
}

export function logCache(
  ctx: Context,
  { name, version, packageString }: CachedPackage,
  hit: boolean,
  type?: 'failure'
): void {
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

/**
 * Serves a previously cached build failure for this package, if one exists.
 * Returns true when it wrote the response so the caller can stop.
 */
export function serveFailureCache(
  ctx: Context,
  resolvedPackage: CachedPackage
): boolean {
  const failureCacheEntry = failureCache.get(resolvedPackage.packageString)
  if (!failureCacheEntry) {
    return false
  }

  debug('fetched %s from failure cache', resolvedPackage.packageString)
  ctx.status = failureCacheEntry.status
  ctx.body = failureCacheEntry.body
  logCache(ctx, resolvedPackage, true, 'failure')
  return true
}
