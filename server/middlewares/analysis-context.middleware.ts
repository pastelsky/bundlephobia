import type { Middleware } from 'koa'

import type { AnalysisOperation } from '../analysis/contracts'
import { recordAnalysisRequest } from '../analysis/metrics'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    let status = 500

    try {
      await next()
      status = ctx.response.status
    } finally {
      // HTTP context owns cache/admission decisions; SDK events own worker
      // outcomes. Record directly for scraping, independently of log output.
      recordAnalysisRequest({
        ...ctx.state.analysis,
        clientType: ctx.get('X-Bundlephobia-Client-Type') || 'unknown',
        clientFamily: ctx.get('X-Bundlephobia-Client-Family') || 'unknown',
        status,
        probe: Boolean(ctx.query.peek || ctx.query.peep),
      })
    }
  }
}
