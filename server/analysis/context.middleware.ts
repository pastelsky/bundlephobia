import type { Middleware } from 'koa'

import type { AnalysisOperation } from './contracts'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    await next()
  }
}
