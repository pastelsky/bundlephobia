import type { Middleware } from 'koa'
import now from 'performance-now'

import type {
  PackageExportSizesResult,
  PackageIdentity,
} from '../../types/package-domain'
import Cache from '../../utils/cache.utils'
import { getRequestPriority } from '../../utils/server.utils'
import { buildService } from '../api/BuildService'
import logger from '../Logger'
import {
  cachePolicy,
  logCache,
  serveFailureCache,
  sizeCacheMaxAge,
} from './results/packageCache'
import {
  getExactRequestedVersion,
  requireResolvedPackage,
} from '../services/packageResolution.service'

/** The export-sizes response: package identity alongside the asset list. */
type ExportSizesBody = PackageIdentity & PackageExportSizesResult

const exportsSizesCache = new Cache()

// Serves a cached export-sizes result / cached failure for an already resolved
// package. A miss falls through to the build; cache-only stops with a 404.
export const serveExportSizesFromCache: Middleware = async (ctx, next) => {
  const request = ctx.state.packageRequest
  const { readsCache, notFoundOnMiss } = cachePolicy(request.cacheMode)
  const resolvedPackage = requireResolvedPackage(ctx.state.resolvedPackage)

  if (readsCache) {
    const cached = await exportsSizesCache.getExportsSize<ExportSizesBody>(
      resolvedPackage
    )
    if (cached) {
      ctx.cacheControl = {
        maxAge: sizeCacheMaxAge(
          request.cacheMode,
          getExactRequestedVersion(request) !== null
        ),
      }
      ctx.body = cached
      logCache(ctx, resolvedPackage, true)
      return
    }
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

// Builds per-export sizes for a resolved package, caches them, and responds.
export const buildExportSizes: Middleware = async ctx => {
  const request = ctx.state.packageRequest
  const resolvedPackage = requireResolvedPackage(ctx.state.resolvedPackage)
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = resolvedPackage

  const buildStart = now()
  const result =
    await buildService.getPackageExportSizes<PackageExportSizesResult>(
      packageString,
      priority
    )
  const time = now() - buildStart

  const body: ExportSizesBody = { name, version, ...result }
  await exportsSizesCache.setExportsSize({ name, version }, body)

  ctx.cacheControl = {
    maxAge: sizeCacheMaxAge(
      request.cacheMode,
      getExactRequestedVersion(request) !== null
    ),
  }
  ctx.body = body

  logger.info(
    'BUILD_EXPORTS_SIZES',
    { result, requestId: ctx.state.id, packageString, time },
    `BUILD EXPORTS SIZES: ${packageString} built in ${time.toFixed()}s`
  )
}
