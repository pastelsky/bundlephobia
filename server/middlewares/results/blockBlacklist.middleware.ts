import type { Middleware } from 'koa'

import { PackageCacheMode } from '../../../utils/packageApi.utils'
import config from '../../config'
import CustomError from '../../CustomError'
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

// Blocks packages that should not enter the normal cache/build pipeline.
// Force-rebuild requests may intentionally retry despite those rules.
const blockBlacklistMiddleware: Middleware = async (ctx, next) => {
  const { cacheMode } = ctx.state.packageRequest

  if (cacheMode === PackageCacheMode.ForceRebuild) {
    await next()
    return
  }

  assertPackageRequestIsBuildable(ctx.state.packageRequest)

  await next()
}

export default blockBlacklistMiddleware
