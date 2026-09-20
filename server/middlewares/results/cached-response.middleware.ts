import type { Middleware } from 'koa'

import { createJavaScriptPackageReference } from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import config from '../../config'
import logger from '../../infrastructure/logger.service'

const cachedResponse: Middleware = async (ctx, next) => {
  const { force, peep } = ctx.query

  if (force) {
    await next()

    return
  }

  const { name, version, packageString, language } = ctx.state.resolved
  const { operation } = ctx.state.analysis

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
