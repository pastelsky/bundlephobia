import type { Context, Middleware } from 'koa'
import { z } from 'zod'
import type CacheServiceClient from '../clients/cache-service.client'
import { createCachedAnalysisReader } from '../services/cached-analysis.service'

// Classification only removes permission to build; spoofing cannot grant privileges.
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
    // Export discovery has no durable cache. Never invoke its builder here.
    if (operation === 'exports') return false

    try {
      const result = await read(specifier, operation)

      if (result.status !== 'hit') return false
      ctx.set(
        'Cache-Control',
        ctx.query.force === undefined ? 'public, max-age=300' : 'no-store',
      )
      ctx.body = result.value

      return true
    } catch (error) {
      if (error instanceof TypeError)
        ctx.throw(400, 'Expected an npm registry package')

      return false
    }
  }

  return async (ctx, next) => {
    const cacheOnly =
      isAutomatedClient(ctx.get('User-Agent')) || ctx.query.peep !== undefined

    if (!cacheOnly) {
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
