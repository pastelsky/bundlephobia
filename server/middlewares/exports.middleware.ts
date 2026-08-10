import type { Middleware } from 'koa'
import now from 'performance-now'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import { getRequestPriority } from '../../utils/server.utils'
import { packageAnalysisGateway } from '../analysis'
import { BUILD_DURATION_HEADER } from '../api/BuildService'
import config from '../config'
import logger from '../Logger'

const exportsMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, package: packageQuery } = ctx.query
  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
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

  ctx.cacheControl = {
    maxAge:
      force != null
        ? 0
        : requestedPackage &&
            packageAnalysisGateway.isExactVersionSpecifier(
              createJavaScriptPackageReference(requestedPackage),
            )
          ? config.CACHE.SIZE_API_HAS_VERSION
          : config.CACHE.SIZE_API_DEFAULT,
  }

  ctx.body = { name, version, exports: result }
  const time = buildEnd - buildStart

  logger.info(
    'BUILD_EXPORTS',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      language: ctx.state.analysis.language,
      operation: ctx.state.analysis.operation,
      time,
    },
    `BUILD EXPORTS: ${packageString} built in ${time.toFixed()}s`,
  )
}

export default exportsMiddleware
