import type { Context, Middleware } from 'koa'
import { z } from 'zod'
import type CacheServiceClient from '../clients/cache-service.client'
import { createCachedAnalysisReader } from '../services/cached-analysis.service'

// This selects stale-cache preference, never a rate-limit exemption.
export function isAutomatedClient(userAgent: string): boolean {
  return /curl|bot|spider|crawler|headlesschrome|prerender|shields\.io|badgen|depscope|ahrefs|\bgot\b/i.test(
    userAgent,
  )
}

export function createCachedAnalysisMiddleware(
  operation: 'size' | 'exports' | 'exports-sizes',
  cache: CacheServiceClient,
): Middleware {
  const { read } = createCachedAnalysisReader(cache)

  async function serveCached(
    ctx: Context,
    specifier: string,
  ): Promise<boolean> {
    // Export discovery has no durable cache; normal build admission handles it.
    if (operation === 'exports') return false

    try {
      const result = await read(
        specifier,
        operation,
        isAutomatedClient(ctx.get('User-Agent')),
      )

      if (result.status === 'miss') return false

      if (result.status !== 'hit') ctx.throw(503, 'Cache backend unavailable')
      ctx.set('Cache-Control', 'private, no-store')
      ctx.body = result.value

      return true
    } catch (error) {
      if (error instanceof TypeError)
        ctx.throw(400, 'Expected an npm registry package')
      ctx.throw(503, 'Cached analysis lookup failed', {
        headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
      })

      return false
    }
  }

  return async (ctx, next) => {
    const preferCache =
      isAutomatedClient(ctx.get('User-Agent')) || ctx.query.peep !== undefined

    if (!preferCache) {
      await next()

      return
    }

    const specifier = z.string().min(1).safeParse(ctx.query.package)

    if (!specifier.success) {
      ctx.throw(400, 'package query parameter is required')

      return
    }

    ctx.vary('User-Agent')

    if (await serveCached(ctx, specifier.data)) return

    if (ctx.query.peep === undefined) {
      // An actual miss may build, but cannot force a rebuild of a cached release.
      ctx.query = { ...ctx.query, force: '' }
      await next()

      return
    }

    ctx.status = 503
    ctx.set('Cache-Control', 'no-store')
    ctx.set('Retry-After', '3600')
    ctx.body = {
      error: {
        code: 'ANALYSIS_NOT_AVAILABLE',
        message:
          'No cached analysis is available. This request does not start a build.',
      },
    }
  }
}
