import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import Cache from '../../utils/cache.utils'
import { getRequestPriority } from '../../utils/server.utils'
import { buildService } from '../api/BuildService'
import config from '../config'
import logger from '../Logger'
import { requireResolvedPackage } from '../services/packageResolution.service'
import type { PackageExportSizesResult } from '../types'

const cache = new Cache()

const exportSizesMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = requireResolvedPackage(
    ctx.state.resolved
  )
  const { forceBuild, peekOnly } = ctx.state.packageRequestPolicy

  if (peekOnly) {
    ctx.body = { name, version, peekSuccess: false }
    return
  }

  const buildStart = now()
  const result =
    await buildService.getPackageExportSizes<PackageExportSizesResult>(
      packageString,
      priority
    )
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: forceBuild
      ? 0
      : semver.valid(ctx.state.requestedPackage.version ?? '')
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

  if (forceBuild) {
    void cache.setExportsSize({ name, version }, body)
  }
}

export default exportSizesMiddleware
