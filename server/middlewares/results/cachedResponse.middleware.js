const semver = require('semver')
const CONFIG = require('../../config')
const { failureCache, debug } = require('../../init')
const logger = require('../../Logger')

async function cachedResponse(ctx, next) {
  const { force } = ctx.query
  if (force) {
    await next()
    return
  }
  const { name, version, packageString } = ctx.state.resolved

  const logCache = ({ hit, type = '', message }) =>
    logger.info(
      'CACHE',
      {
        name,
        version,
        packageString,
        hit,
        type,
        requestId: ctx.state.id,
      },
      message
    )

  const cached = await ctx.cashed()
  if (cached) {
    ctx.cacheControl = {
      maxAge: force
        ? 0
        : semver.valid(version)
        ? CONFIG.CACHE.SIZE_API_HAS_VERSION
        : CONFIG.CACHE.SIZE_API_DEFAULT,
    }

    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })
    return
  }

  const failureCacheEntry = failureCache.get(packageString)
  if (failureCacheEntry) {
    debug('fetched %s from failure cache', packageString)

    logCache({
      hit: true,
      type: 'failure',
      message: `FAILURE CACHE HIT: ${packageString}`,
    })

    ctx.status = failureCacheEntry.status
    ctx.body = failureCacheEntry.body
    return
  }

  logCache({ hit: false, message: `CACHE MISS: ${packageString}` })
  await next()
}

module.exports = cachedResponse
