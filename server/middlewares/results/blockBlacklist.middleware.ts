import type { Middleware } from 'koa'

import config from '../../config'
import CustomError from '../../CustomError'
import { cachePolicy } from './packageCache'
import type { PackageRequest } from '../../types'

export function assertPackageRequestIsBuildable(
  packageRequest: PackageRequest
): void {
  const { name } = packageRequest

  if (config.blackList.some(entry => entry.test(name))) {
    throw new CustomError('BlocklistedPackageError', packageRequest, undefined)
  }

  const matchedUnsupportedRule = config.unsupported.find(rule =>
    new RegExp(rule.test).test(name)
  )

  if (matchedUnsupportedRule) {
    throw new CustomError('UnsupportedPackageError', packageRequest, {
      reason: matchedUnsupportedRule.reason,
    })
  }
}

// Rejects blocklisted / unsupported packages before any resolution or build.
// Force-rebuild requests may intentionally retry despite those rules.
const blockBlacklistMiddleware: Middleware = async (ctx, next) => {
  if (!cachePolicy(ctx.state.packageRequest.cacheMode).bypassesBlocklist) {
    assertPackageRequestIsBuildable(ctx.state.packageRequest)
  }

  await next()
}

export default blockBlacklistMiddleware
