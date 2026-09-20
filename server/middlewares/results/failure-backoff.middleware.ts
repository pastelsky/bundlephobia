import type { Middleware } from 'koa'

import { createAnalysisKey } from '../../analysis/keys'
import { isFailureBlocked } from '../../failure-backoff'
import { failureCache } from '../../infrastructure/runtime'
import logger from '../../infrastructure/logger.service'

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

      logger.info(
        'BUILD_BACKOFF',
        {
          blockedUntil: failureCacheEntry.blockedUntil,
          consecutiveFailures: failureCacheEntry.consecutiveFailures,
          language,
          operation,
          packageString,
          requestId: ctx.state.id,
          retryAfterSeconds,
          status: failureCacheEntry.status,
        },
        `BUILD BACKOFF: ${packageString} blocked after ${failureCacheEntry.consecutiveFailures} consecutive failures`,
      )
      ctx.set('Retry-After', String(retryAfterSeconds))
      ctx.cacheControl = { maxAge: 0 }
      ctx.status = failureCacheEntry.status
      ctx.body = {
        error: {
          code: 'BuildError',
          message:
            'The package has failed to build multiple times recently and further tries are temporarily paused. Please try again later.',
        },
      }

      return
    }
  }

  await next()

  if (ctx.status >= 200 && ctx.status < 400) {
    failureCache.del(failureCacheKey)
  }
}

export default failureBackoffMiddleware
