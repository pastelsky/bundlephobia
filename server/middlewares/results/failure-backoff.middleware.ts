import type { Middleware } from 'koa'

import { createAnalysisKey } from '../../analysis/keys'
import { isFailureBlocked } from '../../failure-backoff'
import { debug, failureCache } from '../../infrastructure/runtime'

const failureBackoffMiddleware: Middleware = async (ctx, next) => {
  const { force } = ctx.query
  const { language, operation } = ctx.state.analysis
  const { packageString } = ctx.state.resolved

  const failureCacheKey = createAnalysisKey({
    language,
    operation,
    packageSpecifier: packageString,
  })

  if (!force) {
    const failureCacheEntry = failureCache.get(failureCacheKey)

    if (isFailureBlocked(failureCacheEntry)) {
      const retryAfterSeconds = Math.ceil(
        (failureCacheEntry.blockedUntil - Date.now()) / 1000,
      )

      debug('blocked %s after repeated failures', packageString)
      ctx.set('Retry-After', String(retryAfterSeconds))
      ctx.cacheControl = { maxAge: 0 }
      ctx.status = failureCacheEntry.status
      ctx.body = failureCacheEntry.body

      return
    }
  }

  await next()

  if (ctx.status >= 200 && ctx.status < 400) {
    failureCache.del(failureCacheKey)
  }
}

export default failureBackoffMiddleware
