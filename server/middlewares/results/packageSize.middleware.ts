import type { Middleware } from 'koa'
import now from 'performance-now'

import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageMetadata,
} from '../../../types/package-domain'
import Cache, { type CacheKey } from '../../../utils/cache.utils'
import firebaseUtils from '../../../utils/firebase.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import { buildService } from '../../api/BuildService'
import { debug, logger } from '../../init'
import {
  createResolvedPackage,
  getExactRequestedVersion,
  requireResolvedPackage,
  resolvePackageRequest,
} from '../../services/packageResolution.service'
import type { PackageRequest, ResolvedPackage } from '../../types'
import {
  cachePolicy,
  logCache,
  serveFailureCache,
  sizeCacheMaxAge,
} from './packageCache'

/** Build-worker stats for a package, before identity + metadata are attached. */
type PackageSizeStats = Omit<
  PackageBuildResult,
  keyof PackageMetadata | 'scoped'
>

const sizeCache = new Cache()

function resolvedPackageFromCache(
  request: PackageRequest,
  cached: PackageBuildInfo
): ResolvedPackage {
  return createResolvedPackage(request, {
    name: cached.name,
    version: cached.version,
    description: cached.description ?? undefined,
    repository: cached.repository ?? undefined,
  })
}

interface PackageSizeLookup {
  resolvedPackage: ResolvedPackage
  cachedResult?: PackageBuildInfo
}

interface SizeCacheReader {
  getPackageSize(key: CacheKey): Promise<PackageBuildInfo | undefined>
}

interface LookupDependencies {
  cache?: SizeCacheReader
  resolvePackage?: typeof resolvePackageRequest
}

/**
 * Resolves a request to an exact version and reads the size cache. An exact
 * version is read before resolving (so a cached result still serves when npm
 * is down); tags/ranges resolve first, then read by resolved version.
 * Dependencies are injectable for testing.
 */
export async function lookupPackageSize(
  request: PackageRequest,
  {
    cache = sizeCache,
    resolvePackage = resolvePackageRequest,
  }: LookupDependencies = {}
): Promise<PackageSizeLookup> {
  const { readsCache } = cachePolicy(request.cacheMode)
  const exactVersion = getExactRequestedVersion(request)

  if (readsCache && exactVersion !== null) {
    const cachedResult = await cache.getPackageSize({
      name: request.name,
      version: exactVersion,
    })
    if (cachedResult) {
      return {
        resolvedPackage: resolvedPackageFromCache(request, cachedResult),
        cachedResult,
      }
    }
  }

  const resolvedPackage = await resolvePackage(request)

  const exactVersionAlreadyRead =
    exactVersion !== null &&
    resolvedPackage.name === request.name &&
    resolvedPackage.version === exactVersion

  if (readsCache && !exactVersionAlreadyRead) {
    const cachedResult = await cache.getPackageSize({
      name: resolvedPackage.name,
      version: resolvedPackage.version,
    })
    if (cachedResult) {
      return { resolvedPackage, cachedResult }
    }
  }

  return { resolvedPackage }
}

/**
 * SSR cache-only read: an exactly-pinned cached size without touching npm.
 * Returns null for tags, ranges, force-rebuild, or a miss.
 */
export async function readCachedPackageSize(
  request: PackageRequest
): Promise<PackageBuildInfo | null> {
  if (!cachePolicy(request.cacheMode).readsCache) {
    return null
  }
  const exactVersion = getExactRequestedVersion(request)
  if (exactVersion === null) {
    return null
  }
  const cached = await sizeCache.getPackageSize<PackageBuildInfo>({
    name: request.name,
    version: exactVersion,
  })
  return cached ?? null
}

// Resolves the package and serves any cached size / cached failure. A miss on
// a normal request falls through to the build; cache-only stops with a 404.
export const resolveAndServePackageSize: Middleware = async (ctx, next) => {
  const request = ctx.state.packageRequest
  const startedAt = now()
  const { resolvedPackage, cachedResult } = await lookupPackageSize(request)
  const time = now() - startedAt
  ctx.state.resolvedPackage = resolvedPackage

  debug('resolved to %s', resolvedPackage.packageString)
  logger.info(
    'RESOLVE_PACKAGE',
    {
      ...resolvedPackage,
      cache: cachedResult ? 'cache-hit' : 'cache-miss',
      time,
      requestId: ctx.state.id,
    },
    `RESOLVED: ${resolvedPackage.packageString} in ${time.toFixed(0)}ms`
  )

  const { readsCache, notFoundOnMiss } = cachePolicy(request.cacheMode)

  if (cachedResult) {
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

  if (readsCache) {
    if (serveFailureCache(ctx, resolvedPackage)) {
      return
    }
    logCache(ctx, resolvedPackage, false)
  }

  if (notFoundOnMiss) {
    ctx.status = 404
    return
  }

  await next()
}

// Builds the size for a resolved package, caches it, and responds. Reached
// only after the cache stage missed.
export const buildPackageSize: Middleware = async ctx => {
  const request = ctx.state.packageRequest
  const resolvedPackage = requireResolvedPackage(ctx.state.resolvedPackage)
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = resolvedPackage

  const cancelOnDisconnect = () => {
    logger.info(
      'BUILD_ABORTED',
      { requestId: ctx.state.id, packageString },
      `BUILD_ABORTED: client closed connection for package ${packageString}`
    )
    buildService.cancelPackageBuildStats(packageString)
  }
  ctx.req.on('close', cancelOnDisconnect)

  const buildStart = now()
  let stats: PackageSizeStats
  try {
    stats = await buildService.getPackageBuildStats<PackageSizeStats>(
      packageString,
      priority
    )
  } finally {
    ctx.req.off('close', cancelOnDisconnect)
  }
  const time = now() - buildStart

  const result: PackageBuildResult = {
    ...stats,
    scoped: resolvedPackage.scoped,
    name,
    version,
    description: resolvedPackage.description,
    repository: resolvedPackage.repository,
  }

  await sizeCache.setPackageSize({ name, version }, result)

  ctx.cacheControl = {
    maxAge: sizeCacheMaxAge(
      request.cacheMode,
      getExactRequestedVersion(request) !== null
    ),
  }
  ctx.body = result

  logger.info(
    'BUILD',
    { result, requestId: ctx.state.id, packageString, time },
    `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
      result.size
    } bytes`
  )

  if (ctx.query.record === 'true') {
    firebaseUtils.setRecentSearch(name, { name, version })
  }
}
