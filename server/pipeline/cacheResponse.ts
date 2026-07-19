import type { Context } from 'koa'

import { debug, failureCache } from '../init'
import logger from '../Logger'

interface CachedPackage {
  name: string
  version: string
  packageString: string
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
