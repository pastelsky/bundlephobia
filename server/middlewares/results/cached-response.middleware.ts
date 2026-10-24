import type { Middleware } from 'koa'

import { createJavaScriptPackageReference } from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import config from '../../config'
import { createAnalysisKey } from '../../analysis/keys'
import { failureCache } from '../../infrastructure/runtime'
import logger from '../../infrastructure/logger.service'

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep } = ctx.query
  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis

  if (force === 'true') {
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

    logCache({ hit: true, message: `CACHE HIT: ${packageString}` })

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
