import type { Context, Middleware, Next } from 'koa'

import { createJavaScriptPackageReference } from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import config from '../../config'
import { createAnalysisKey } from '../../analysis/keys'
import { failureCache } from '../../infrastructure/runtime'
import logger from '../../infrastructure/logger.service'
import { recordCacheResponse } from '../../infrastructure/request-metrics'

function recordResponse(ctx: Context, cache: 'hit' | 'miss') {
  if (ctx.status !== 200 || ctx.query.peek || ctx.query.peep) return

  recordCacheResponse(ctx.state.analysis.operation, cache)
}

async function serveUncached(ctx: Context, next: Next) {
  await next()
  recordResponse(ctx, 'miss')
}

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep } = ctx.query
  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis

  if (force === 'true') {
    await serveUncached(ctx, next)

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
    failureCache.del(
      createAnalysisKey({
        language,
        operation,
        packageSpecifier: packageString,
      }),
    )
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

    recordResponse(ctx, 'hit')
    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })

    return
  }

  logCache({ hit: false, message: `CACHE MISS: ${packageString}` })

  if (peep) {
    ctx.status = 404

    return
  }

  await serveUncached(ctx, next)
}

export default cachedResponse
