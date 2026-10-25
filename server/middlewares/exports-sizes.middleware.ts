import type { Middleware } from 'koa'

import { getAnalysisCacheMaxAge } from '../services/analysis-cache-policy'
import now from 'performance-now'

import type {
  CacheKey,
  ExportsCacheResult,
} from '@bundlephobia/service-contracts/cache'

import { getRequestPriority } from '../../utils/server.utils'
import { packageAnalysisGateway } from '../analysis'
import { BUILD_DURATION_HEADER } from '../clients/build-service.client'
import logger from '../infrastructure/logger.service'

interface ExportSizesCache {
  setExportsSize(key: CacheKey, result: ExportsCacheResult): Promise<void>
}

export function createExportSizesMiddleware(
  cache: ExportSizesCache,
): Middleware {
  return async ctx => {
    const priority = getRequestPriority(ctx)
    const { name, version, packageString } = ctx.state.resolved
    const { force, peek, package: packageQuery } = ctx.query

    if (peek) {
      ctx.cacheControl = { noStore: true }
      ctx.body = { name, version, peekSuccess: false }

      return
    }

    const buildStart = now()

    ctx.state.analysis.buildRequested = true

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

    ctx.cacheControl = { maxAge: getAnalysisCacheMaxAge(force, packageQuery) }

    const body = { name, version, ...result }
    ctx.body = body
    const time = buildEnd - buildStart

    logger.info(
      'BUILD_EXPORTS_SIZES',
      {
        result,
        requestId: ctx.state.id,
        packageString,
        ...ctx.state.analysis,
        time,
      },
      `BUILD EXPORTS SIZES: ${packageString} built in ${time.toFixed()}s`,
    )

    if (force === 'true') {
      void cache.setExportsSize({ name, version }, body)
    }
  }
}
