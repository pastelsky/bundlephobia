import type { Middleware } from 'koa'
import now from 'performance-now'

import type {
  CacheKey,
  ExportsCacheResult,
} from '@bundlephobia/service-contracts/cache'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import { getRequestPriority } from '../../utils/server.utils'
import { packageAnalysisGateway } from '../analysis/analysis.module'
import { BUILD_DURATION_HEADER } from '../clients/build-service.client'
import config from '../config/server.config'
import logger from '../infrastructure/logger.service'

interface ExportSizesCache {
  setExportsSize(key: CacheKey, result: ExportsCacheResult): Promise<void>
}

function getRequestedPackage(
  packageQuery: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(packageQuery)) return packageQuery.join('/')

  return packageQuery
}

function getCacheMaxAge(
  force: string | string[] | undefined,
  requestedPackage?: string,
): number {
  if (force !== null && force !== undefined) return 0

  if (!requestedPackage) return config.CACHE.SIZE_API_DEFAULT

  return packageAnalysisGateway.isExactVersionSpecifier(
    createJavaScriptPackageReference(requestedPackage),
  )
    ? config.CACHE.SIZE_API_HAS_VERSION
    : config.CACHE.SIZE_API_DEFAULT
}

export function createExportSizesMiddleware(
  cache: ExportSizesCache,
): Middleware {
  return async ctx => {
    const priority = getRequestPriority(ctx)
    const { name, version, packageString } = ctx.state.resolved
    const { force, peek, package: packageQuery } = ctx.query

    if (peek) {
      ctx.body = { name, version, peekSuccess: false }

      return
    }

    const requestedPackage = getRequestedPackage(packageQuery)

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

    ctx.cacheControl = { maxAge: getCacheMaxAge(force, requestedPackage) }

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
}
