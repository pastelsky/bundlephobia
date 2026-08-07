import type { Middleware } from 'koa'

import type { LanguageId } from '../../types/language-domain'
import type { AnalysisOperation } from './contracts'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
  language: LanguageId = 'javascript'
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language, operation }
    await next()
  }
}
