import type { Context, Middleware } from 'koa'
import now from 'performance-now'

import {
  createJavaScriptPackageReference,
  parseJavaScriptPackageSpecifier,
} from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import type { AnalysisOperation } from '../../analysis/contracts'
import type CacheServiceClient from '../../clients/cache-service.client'
import { debug, logger } from '../../infrastructure/runtime'

function prefersBuiltRelease(ctx: Context, version: string | null) {
  return (
    ctx.get('X-Bundlephobia-Prefer-Cached') === 'true' &&
    !ctx.query.force &&
    [null, 'latest'].includes(version)
  )
}

async function serveBuiltRelease(
  ctx: Context,
  cache: Pick<CacheServiceClient, 'getPackageSize'>,
  name: string,
) {
  const cached = await cache.getPackageSize({ name, version: 'latest-built' })

  if (cached.status === 'miss') return false
  ctx.cacheControl = { private: true, noStore: true }
  ctx.status = cached.status === 'hit' ? 200 : 503
  ctx.body =
    cached.status === 'hit'
      ? cached.value
      : {
          error: {
            code: 'CacheUnavailable',
            message: 'Cached analysis is temporarily unavailable.',
          },
        }

  if (cached.status !== 'hit') ctx.set('Retry-After', '60')

  return true
}

export function createResolvePackageMiddleware(
  operation: AnalysisOperation,
  cache?: Pick<CacheServiceClient, 'getPackageSize'>,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    const packageQuery = ctx.query.package

    const packageString = Array.isArray(packageQuery)
      ? packageQuery.join('/')
      : packageQuery

    if (!packageString) {
      ctx.throw(400, 'package query parameter is required')

      return
    }

    const resolvedPackageString = packageString
    const parsedPackage = parseJavaScriptPackageSpecifier(resolvedPackageString)

    ctx.state.resolved = {
      language: 'javascript',
      specifier: resolvedPackageString,
      ...parsedPackage,
      version: parsedPackage.version ?? 'latest',
      displayName: parsedPackage.name,
      canonicalSpecifier: `${parsedPackage.name}@${parsedPackage.version}`,
      description: '',
      repository: '',
      packageString: `${parsedPackage.name}@${parsedPackage.version}`,
    }

    if (
      cache &&
      prefersBuiltRelease(ctx, parsedPackage.version) &&
      (await serveBuiltRelease(ctx, cache, parsedPackage.name))
    )
      return

    const resolveStart = now()

    const resolvedPackage = await packageAnalysisGateway.resolvePackage(
      createJavaScriptPackageReference(resolvedPackageString),
    )

    const resolveEnd = now()

    const result = {
      ...resolvedPackage,
      scoped: parsedPackage.scoped,
      packageString: resolvedPackage.canonicalSpecifier,
    }

    ctx.state.resolved = result

    debug('resolved to %s@%s', result.name, result.version)
    const time = resolveEnd - resolveStart
    logger.info(
      'RESOLVE_PACKAGE',
      { ...ctx.state.analysis, ...result, time, requestId: ctx.state.id },
      `RESOLVED: ${result.packageString} in ${time.toFixed(0)}ms`,
    )

    await next()
  }
}
