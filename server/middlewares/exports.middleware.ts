import type { Middleware } from 'koa'
import now from 'performance-now'

import { getRequestPriority } from '../../utils/server.utils'
import { buildService } from '../api/BuildService'
import logger from '../Logger'
import { cachePolicy, sizeCacheMaxAge } from './results/packageCache'
import {
  getExactRequestedVersion,
  requireResolvedPackage,
} from '../services/packageResolution.service'
import type { PackageExportsResult } from '../types'

// Builds the export map for an already resolved package. There is no export
// cache, so a cache-only request simply has nothing to serve.
const exportsMiddleware: Middleware = async ctx => {
  const request = ctx.state.packageRequest
  if (cachePolicy(request.cacheMode).notFoundOnMiss) {
    ctx.status = 404
    return
  }

  const { name, version, packageString } = requireResolvedPackage(
    ctx.state.resolvedPackage
  )
  const priority = getRequestPriority(ctx)

  const buildStart = now()
  const exports = await buildService.getPackageExports<PackageExportsResult>(
    packageString,
    priority
  )
  const time = now() - buildStart

  ctx.cacheControl = {
    maxAge: sizeCacheMaxAge(
      request.cacheMode,
      getExactRequestedVersion(request) !== null
    ),
  }
  ctx.body = { name, version, exports }

  logger.info(
    'BUILD_EXPORTS',
    { result: exports, requestId: ctx.state.id, packageString, time },
    `BUILD EXPORTS: ${packageString} built in ${time.toFixed()}s`
  )
}

export default exportsMiddleware
