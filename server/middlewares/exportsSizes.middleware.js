const semver = require('semver')
const CONFIG = require('../config')
const now = require('performance-now')
const logger = require('../Logger')
const Cache = require('../../utils/cache.utils')
const { getRequestPriority } = require('../../utils/server.utils')
const { parsePackageString } = require('../../utils/common.utils')
const BuildService = require('../api/BuildService')

const cache = new Cache()
const buildService = new BuildService()

async function exportSizesMiddleware(ctx) {
  let result,
    priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, peek, package: packageQuery } = ctx.query

  if (peek) {
    return { name, version, peekSuccess: false }
  }

  const buildStart = now()
  result = await buildService.getPackageExportSizes(packageString, priority)

  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: force
      ? 0
      : semver.valid(parsePackageString(packageQuery).version)
      ? CONFIG.CACHE.SIZE_API_HAS_VERSION
      : CONFIG.CACHE.SIZE_API_DEFAULT,
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
    cache.setExportsSize({ name, version }, body)
  }
}

module.exports = exportSizesMiddleware
