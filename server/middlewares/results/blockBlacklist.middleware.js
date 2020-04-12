const { parsePackageString } = require('../../../utils/common.utils')
const CustomError = require('./../../CustomError')
const CONFIG = require('../../config')

async function blockBlacklistMiddleware(ctx, next) {
  const { package: packageString, force } = ctx.query
  if (force) {
    await next()
    return
  }

  const parsedPackage = parsePackageString(packageString)

  // If package is blacklisted, fail fast
  if (CONFIG.blackList.some(entry => entry.test(parsedPackage.name))) {
    throw new CustomError('BlacklistedPackageError', { ...parsedPackage })
  }

  // If package is unsupported, fail fast
  const matchedUnsupportedRule = CONFIG.unsupported.find(rule =>
    new RegExp(rule.test).test(parsedPackage.name)
  )
  if (matchedUnsupportedRule) {
    throw new CustomError(
      'UnsupportedPackageError',
      { ...parsedPackage },
      { reason: matchedUnsupportedRule.reason }
    )
  }

  await next()
}

module.exports = blockBlacklistMiddleware
