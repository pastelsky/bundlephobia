import type { Middleware } from 'koa'
import type { PackageEntryPointsResult } from '@bundlephobia/service-contracts/package'
import type CacheServiceClient from '../clients/cache-service.client'
import { BUILD_DURATION_HEADER } from '../clients/build-service.client'
import { packageAnalysisGateway } from '../analysis'
import { getRequestPriority } from '../../utils/server.utils'
import config from '../config'

export function createEntryPointsController(
  cache: CacheServiceClient,
): Middleware {
  return async ctx => {
    const { name, version } = ctx.state.resolved

    const entryPoints = await packageAnalysisGateway.listPackageEntryPoints(
      ctx.state.resolved,
      {
        priority: getRequestPriority(ctx),
        signal: ctx.state.analysis.signal,
        onComplete: durationMs =>
          ctx.set(BUILD_DURATION_HEADER, String(durationMs)),
      },
    )

    const body: PackageEntryPointsResult = { name, version, entryPoints }
    ctx.body = body
    ctx.cacheControl = {
      maxAge: ctx.query.force ? 0 : config.CACHE.SIZE_API_DEFAULT,
    }

    if (ctx.query.force === 'true')
      await cache.setEntryPoints({ name, version }, body)
  }
}
