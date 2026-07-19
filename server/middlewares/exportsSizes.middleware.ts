import type { Middleware } from 'koa'
import now from 'performance-now'

import Cache from '../../utils/cache.utils'
import { PackageCacheMode } from '../../utils/packageApi.utils'
import { getRequestPriority } from '../../utils/server.utils'
import { buildService } from '../api/BuildService'
import config from '../config'
import logger from '../Logger'
import {
  getExactRequestedVersion,
  requireResolvedPackage,
} from '../services/packageResolution.service'
import type { PackageExportSizesResult } from '../types'

const cache = new Cache()

// Builds per-export sizes for one already resolved package version.
// Force-rebuild mode also replaces the endpoint's persistent cache entry.
const exportSizesMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = requireResolvedPackage(
    ctx.state.resolvedPackage
  )
  const { cacheMode } = ctx.state.packageRequest

  const buildStart = now()
  const result =
    await buildService.getPackageExportSizes<PackageExportSizesResult>(
      packageString,
      priority
    )
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge:
      cacheMode === PackageCacheMode.ForceRebuild
        ? 0
        : getExactRequestedVersion(ctx.state.packageRequest) !== null
        ? config.CACHE.SIZE_API_HAS_VERSION
        : config.CACHE.SIZE_API_DEFAULT,
  }

  const body = { name, version, ...result }
  ctx.body = body
  const time = buildEnd - buildStart

  logger.info(
    'BUILD_EXPORTS_SIZES',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      time,
    },
    `BUILD EXPORTS SIZES: ${packageString} built in ${time.toFixed()}s`
  )

  if (cacheMode === PackageCacheMode.ForceRebuild) {
    void cache.setExportsSize({ name, version }, body)
  }
}

export default exportSizesMiddleware
