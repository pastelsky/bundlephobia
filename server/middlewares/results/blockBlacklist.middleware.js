const { parsePackageString } = require('../../../utils/common.utils')
const CustomError = require('./../../CustomError')
const CONFIG = require('../../config')

async function blockBlacklistMiddleware(ctx, next) {
  const { package: packageString } = ctx.query
  const parsedPackage = parsePackageString(packageString)

  // If package is blacklisted, fail fast
  if (CONFIG.blackList.some(entry => entry.test(parsedPackage.name))) {
    throw new CustomError('BlacklistedPackageError', { ...parsedPackage })
  }

  await next()
}

module.exports = blockBlacklistMiddleware