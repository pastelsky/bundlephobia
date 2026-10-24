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
  const hasCrawlerCachePreference =
    ctx.get('X-Bundlephobia-Prefer-Cached') === 'true'

  const forceWasRequested = ctx.query.force === 'true'
  const isLatestVersion = version === null || version === 'latest'

  return hasCrawlerCachePreference && !forceWasRequested && isLatestVersion
}

async function serveBuiltRelease(
  ctx: Context,
  cache: Pick<CacheServiceClient, 'getLatestBuiltPackageSize'>,
  name: string,
) {
  const cacheResult = await cache.getLatestBuiltPackageSize(name)

  if (cacheResult.status === 'miss') return false

  ctx.cacheControl = { private: true, noStore: true }

  if (cacheResult.status === 'hit') {
    ctx.status = 200
    ctx.body = cacheResult.value

    return true
  }

  ctx.status = 503
  ctx.body = {
    error: {
      code: 'CacheUnavailable',
      message: 'Cached analysis is temporarily unavailable.',
    },
  }
  ctx.set('Retry-After', '60')

  return true
}

export function createResolvePackageMiddleware(
  operation: AnalysisOperation,
  cache?: Pick<CacheServiceClient, 'getLatestBuiltPackageSize'>,
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

    if (cache && prefersBuiltRelease(ctx, parsedPackage.version)) {
      const responseWasServed = await serveBuiltRelease(
        ctx,
        cache,
        parsedPackage.name,
      )

      if (responseWasServed) return
    }

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
