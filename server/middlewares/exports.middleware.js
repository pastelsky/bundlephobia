const semver = require('semver')
const CONFIG = require('../config')
const now = require('performance-now')
const logger = require('../Logger')
const { getRequestPriority } = require('../../utils/server.utils')
const { parsePackageString } = require('../../utils/common.utils')
const BuildService = require('../api/BuildService')

const buildService = new BuildService()

async function exportsMiddleware(ctx) {
  let result,
    priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, package: packageQuery } = ctx.query

  const buildStart = now()
  result = await buildService.getPackageExports(packageString, priority)

  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: force
      ? 0
      : semver.valid(parsePackageString(packageQuery).version)
      ? CONFIG.CACHE.SIZE_API_HAS_VERSION
      : CONFIG.CACHE.SIZE_API_DEFAULT,
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

module.exports = exportsMiddleware
