import type { Middleware } from 'koa'
import now from 'performance-now'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import CacheServiceClient from '../clients/cacheService'
import { getRequestPriority } from '../../utils/server.utils'
import { packageAnalysisGateway } from '../analysis'
import { BUILD_DURATION_HEADER } from '../api/BuildService'
import config from '../config'
import logger from '../Logger'

const cache = new CacheServiceClient()
const exportSizesMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, peek, package: packageQuery } = ctx.query

  if (peek) {
    ctx.body = { name, version, peekSuccess: false }
    return
  }

  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
  const result = await packageAnalysisGateway.analyzePackageExportSizes(
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

  const body = { name, version, ...result }
  ctx.body = body
  const time = buildEnd - buildStart

  logger.info(
    'BUILD_EXPORTS_SIZES',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      language: ctx.state.analysis.language,
      operation: ctx.state.analysis.operation,
      time,
    },
    `BUILD EXPORTS SIZES: ${packageString} built in ${time.toFixed()}s`,
  )

  if (force === 'true') {
    void cache.setExportsSize({ name, version }, body)
  }
}

export default exportSizesMiddleware
