import type { Middleware } from 'koa'

import config from '../../config'
import CustomError from '../../CustomError'

const blockBlacklistMiddleware: Middleware = async (ctx, next) => {
  if (ctx.state.packageRequestPolicy.forceBuild) {
    await next()
    return
  }

  const requestedPackage = ctx.state.requestedPackage

  if (config.blackList.some(entry => entry.test(requestedPackage.name))) {
    throw new CustomError(
      'BlocklistedPackageError',
      { ...requestedPackage },
      undefined
    )
  }

  const matchedUnsupportedRule = config.unsupported.find(rule =>
    new RegExp(rule.test).test(requestedPackage.name)
  )

  if (matchedUnsupportedRule) {
    throw new CustomError(
      'UnsupportedPackageError',
      { ...requestedPackage },
      { reason: matchedUnsupportedRule.reason }
    )
  }

  await next()
}

export default blockBlacklistMiddleware
