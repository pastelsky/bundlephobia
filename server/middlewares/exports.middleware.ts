import type { Middleware } from 'koa'

import now from 'performance-now'

import { getRequestPriority } from '../../utils/server.utils'
import { packageAnalysisGateway } from '../analysis'
import { BUILD_DURATION_HEADER } from '../clients/build-service.client'
import logger from '../infrastructure/logger.service'
import { getBuildCacheMaxAge } from '../services/build-cache-policy'

const exportsMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, package: packageQuery } = ctx.query

  const buildStart = now()

  ctx.state.analysis.cache = 'bypass'
  ctx.state.analysis.buildRequested = true

  const result = await packageAnalysisGateway.analyzePackageExports(
    ctx.state.resolved,
    {
      priority,
      onComplete: durationMs => {
        ctx.set(BUILD_DURATION_HEADER, String(durationMs))
      },
    },
  )

  const buildEnd = now()

  ctx.cacheControl = { maxAge: getBuildCacheMaxAge(force, packageQuery) }

  ctx.body = { name, version, exports: result }
  const time = buildEnd - buildStart

  logger.info(
    'BUILD_EXPORTS',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      ...ctx.state.analysis,
      time,
    },
    `BUILD EXPORTS: ${packageString} built in ${time.toFixed()}s`,
  )
}

export default exportsMiddleware
