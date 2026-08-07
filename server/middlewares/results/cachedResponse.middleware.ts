import type { Middleware } from 'koa'

import { packageAnalysisGateway } from '../../analysis'
import config from '../../config'
import { createAnalysisKey } from '../../analysis/keys'
import { debug, failureCache } from '../../init'
import logger from '../../Logger'

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep } = ctx.query
  if (force) {
    await next()
    return
  }

  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis
  const failureCacheKey = createAnalysisKey({
    language,
    operation,
    packageSpecifier: packageString,
  })

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
      message
    )

  const cached = await ctx.cashed()
  if (cached) {
    ctx.cacheControl = {
      maxAge:
        force != null
          ? 0
          : packageAnalysisGateway.isExactVersionSpecifier({
              language,
              specifier: `${name}@${version}`,
            })
          ? config.CACHE.SIZE_API_HAS_VERSION
          : config.CACHE.SIZE_API_DEFAULT,
    }

    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })
    return
  }

  const failureCacheEntry = failureCache.get(failureCacheKey)
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

  if (peep) {
    ctx.status = 404
    return
  }

  await next()
}

export default cachedResponse
