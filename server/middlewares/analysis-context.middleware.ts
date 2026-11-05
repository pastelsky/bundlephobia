import type { Middleware } from 'koa'
import {
  buildCircuitBreaker,
  recordCircuitBreakerResponse,
} from '../infrastructure/build-circuit-breaker'

import type { AnalysisOperation } from '../analysis/contracts'
import { recordAnalysisRequest } from '../analysis/metrics'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    ctx.state.analysis.circuitBreakerActive = await buildCircuitBreaker.check()
    let status = 500

    try {
      await next()
      status = ctx.response.status
    } finally {
      // HTTP context owns cache/admission decisions; SDK events own worker
      // outcomes. Record directly for scraping, independently of log output.
      if (
        ctx.state.analysis.circuitBreakerActive &&
        !ctx.query.peek &&
        !ctx.query.peep
      ) {
        recordCircuitBreakerResponse(
          status === 200 && ctx.state.analysis.cache === 'hit',
          Boolean(ctx.state.analysis.circuitBreakerRejected),
        )
      }

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
