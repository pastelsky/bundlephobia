import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import { parsePackageString } from '../../utils/common.utils'
import { getRequestPriority } from '../../utils/server.utils'
import BuildService from '../api/BuildService'
import config from '../config'
import logger from '../Logger'
import type { PackageExportsResult } from '../types'

const buildService = new BuildService()

const exportsMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, package: packageQuery } = ctx.query
  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
  const result = await buildService.getPackageExports<PackageExportsResult>(
    packageString,
    priority
  )
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge:
      force != null
        ? 0
        : requestedPackage &&
          semver.valid(parsePackageString(requestedPackage).version)
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
