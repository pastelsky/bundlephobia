import type { Middleware } from 'koa'

import type { AnalysisOperation } from '../analysis/contracts'
import {
  getAnalysisClientFamily,
  getAnalysisClientType,
  recordAnalysisRequest,
} from '../infrastructure/request-metrics'

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
        clientType: getAnalysisClientType(
          ctx.get('X-Bundlephobia-Client-Type'),
        ),
        clientFamily: getAnalysisClientFamily(
          ctx.get('X-Bundlephobia-Client-Family'),
        ),
        status,
        probe: Boolean(ctx.query.peek || ctx.query.peep),
      })
    }
  }
}
