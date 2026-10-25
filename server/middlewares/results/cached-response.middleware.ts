import type { Middleware } from 'koa'

import { getAnalysisCacheMaxAge } from '../../services/analysis-cache-policy'

import { createAnalysisKey } from '../../analysis/keys'
import { failureCache } from '../../infrastructure/runtime'
import logger from '../../infrastructure/logger.service'

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep, package: packageQuery } = ctx.query

  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis

  if (force === 'true') {
    ctx.state.analysis.cache = 'bypass'
    await next()

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
        cache: hit ? 'hit' : 'miss',
        type,
        language,
        operation,
        requestId: ctx.state.id,
      },
      message,
    )

  const cached = await ctx.cashed()

  if (cached) {
    ctx.state.analysis.cache = 'hit'
    failureCache.del(
      createAnalysisKey({
        language,
        operation,
        packageSpecifier: packageString,
      }),
    )
    ctx.cacheControl = { maxAge: getAnalysisCacheMaxAge(force, packageQuery) }

    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })

    return
  }

  ctx.state.analysis.cache = 'miss'
  logCache({ hit: false, message: `CACHE MISS: ${packageString}` })

  if (peep) {
    ctx.cacheControl = { noStore: true }
    ctx.status = 404

    return
  }

  await next()
}

export default cachedResponse
