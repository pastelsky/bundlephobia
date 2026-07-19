import type { Middleware } from 'koa'

import config from '../../config'
import CustomError from '../../CustomError'

// Blocks packages that should not enter the normal cache/build pipeline.
// Refresh requests may intentionally retry packages despite those rules.
const blockBlacklistMiddleware: Middleware = async (ctx, next) => {
  const { cacheMode, ...requestedPackage } = ctx.state.packageRequest

  if (cacheMode === 'force-rebuild') {
    await next()
    return
  }

  if (config.blackList.some(entry => entry.test(requestedPackage.name))) {
    throw new CustomError(
      'BlocklistedPackageError',
      requestedPackage,
      undefined
    )
  }

  const matchedUnsupportedRule = config.unsupported.find(rule =>
    new RegExp(rule.test).test(requestedPackage.name)
  )

  if (matchedUnsupportedRule) {
    throw new CustomError('UnsupportedPackageError', requestedPackage, {
      reason: matchedUnsupportedRule.reason,
    })
  }

  await next()
}

export default blockBlacklistMiddleware
