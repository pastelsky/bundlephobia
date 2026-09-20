import type { Middleware } from 'koa'

import type { AnalysisOperation } from '../analysis/analysis.contract'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    await next()
  }
}
