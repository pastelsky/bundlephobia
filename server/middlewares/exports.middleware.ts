import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import { getRequestPriority } from '../../utils/server.utils'
import { buildService } from '../api/BuildService'
import config from '../config'
import logger from '../Logger'
import { requireResolvedPackage } from '../services/packageResolution.service'
import type { PackageExportsResult } from '../types'

const exportsMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = requireResolvedPackage(
    ctx.state.resolved
  )
  const { forceBuild } = ctx.state.packageRequestPolicy

  const buildStart = now()
  const result = await buildService.getPackageExports<PackageExportsResult>(
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

  ctx.body = { name, version, exports: result }
  const time = buildEnd - buildStart

  logger.info(
    'BUILD_EXPORTS',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      time,
    },
    `BUILD EXPORTS: ${packageString} built in ${time.toFixed()}s`
  )
}

export default exportsMiddleware
