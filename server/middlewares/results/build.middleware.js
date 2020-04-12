const semver = require('semver')
const CONFIG = require('../../config')
const firebaseUtils = require('../../../utils/firebase.utils')
const now = require('performance-now')
const logger = require('../../Logger')
const Cache = require('../../../utils/cache.utils')
const BuildService = require('../../api/BuildService')
const { getRequestPriority } = require('../../../utils/server.utils')
const { parsePackageString } = require('../../../utils/common.utils')

const cache = new Cache()
const buildService = new BuildService()

async function buildMiddleware(ctx, next) {
  let result,
    priority = getRequestPriority(ctx)
  const {
    scoped,
    name,
    version,
    description,
    repository,
    packageString,
  } = ctx.state.resolved
  const { force, record, package: packageQuery } = ctx.query

  const buildStart = now()
  result = await buildService.getPackageBuildStats(packageString, priority)
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: force
      ? 0
      : semver.valid(parsePackageString(packageQuery).version)
      ? CONFIG.CACHE.SIZE_API_HAS_VERSION
      : CONFIG.CACHE.SIZE_API_DEFAULT,
  }

  const body = { scoped, name, version, description, repository, ...result }
  ctx.body = body
  ctx.state.buildResult = body
  const time = buildEnd - buildStart

  logger.info(
    'BUILD',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      time,
    },
    `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
      result.size
    } bytes`
  )

  if (record === 'true') {
    firebaseUtils.setRecentSearch(name, { name, version })
  }

  if (force === 'true') {
    cache.setPackageSize({ name, version }, body)
  }
}

module.exports = buildMiddleware
