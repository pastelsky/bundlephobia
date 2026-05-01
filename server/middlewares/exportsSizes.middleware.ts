import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import Cache from '../../utils/cache.utils'
import { parsePackageString } from '../../utils/common.utils'
import { getRequestPriority } from '../../utils/server.utils'
import BuildService from '../api/BuildService'
import config from '../config'
import logger from '../Logger'
import type { PackageExportSizesResult } from '../types'

const cache = new Cache()
const buildService = new BuildService()

const exportSizesMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, peek, package: packageQuery } = ctx.query

  if (peek) {
    ctx.body = { name, version, peekSuccess: false }
    return
  }

  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
  const result =
    await buildService.getPackageExportSizes<PackageExportSizesResult>(
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

  if (force === 'true') {
    void cache.setExportsSize({ name, version }, body)
  }
}

export default exportSizesMiddleware
