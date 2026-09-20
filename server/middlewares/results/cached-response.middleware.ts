import type { Middleware } from 'koa'

import { createJavaScriptPackageReference } from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import config from '../../config'
import { createAnalysisKey } from '../../analysis/keys'
import { debug, failureCache } from '../../infrastructure/runtime'
import { isFailureBlocked } from '../../failure-backoff'
import logger from '../../infrastructure/logger.service'

function clearFailureCacheOnSuccess(
  status: number,
  failureCacheKey: string,
): void {
  if (status >= 200 && status < 400) {
    failureCache.del(failureCacheKey)
  }
}

function respondWithBlockedFailure(
  ctx: Parameters<Middleware>[0],
  packageString: string,
  failureCacheEntry: Extract<ReturnType<typeof failureCache.get>, object> & {
    blockedUntil: number
  },
): void {
  const retryAfterSeconds = Math.ceil(
    (failureCacheEntry.blockedUntil - Date.now()) / 1000,
  )

  debug('blocked %s after repeated failures', packageString)
  ctx.set('Retry-After', String(retryAfterSeconds))
  ctx.cacheControl = { maxAge: 0 }
  ctx.status = failureCacheEntry.status
  ctx.body = failureCacheEntry.body
}

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep } = ctx.query
  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis

  const failureCacheKey = createAnalysisKey({
    language,
    operation,
    packageSpecifier: packageString,
  })

  if (force) {
    await next()

    clearFailureCacheOnSuccess(ctx.status, failureCacheKey)

    return
  }

  const logCache = ({
    hit,
    type = '',
    message,
  }: {
    hit: boolean
    type?: string
    message: string
  }) =>
    logger.info(
      'CACHE',
      {
        name,
        version,
        packageString,
        hit,
        type,
        language,
        operation,
        requestId: ctx.state.id,
      },
      message,
    )

  const cached = await ctx.cashed()

  if (cached) {
    failureCache.del(failureCacheKey)
    ctx.cacheControl = {
      maxAge:
        force === null || force === undefined
          ? packageAnalysisGateway.isExactVersionSpecifier(
              createJavaScriptPackageReference(`${name}@${version}`),
            )
            ? config.CACHE.SIZE_API_HAS_VERSION
            : config.CACHE.SIZE_API_DEFAULT
          : 0,
    }

    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })

    return
  }

  const failureCacheEntry = failureCache.get(failureCacheKey)

  if (isFailureBlocked(failureCacheEntry)) {
    respondWithBlockedFailure(ctx, packageString, failureCacheEntry)

    return
  }

  logCache({ hit: false, message: `CACHE MISS: ${packageString}` })

  if (peep) {
    ctx.status = 404

    return
  }

  await next()

  clearFailureCacheOnSuccess(ctx.status, failureCacheKey)
}

export default cachedResponse
