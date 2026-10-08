import type { Middleware } from 'koa'

import type { AnalysisOperation } from '../analysis/contracts'
import logger from '../infrastructure/logger.service'

export function createAnalysisContextMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    const controller = new AbortController()

    const abort = () => {
      if (ctx.res.writableEnded) return
      const packageString = ctx.state.resolved?.packageString
      logger.info(
        'BUILD_ABORTED',
        {
          requestId: ctx.state.id,
          packageString,
          language: 'javascript',
          operation,
          entryPoint: ctx.state.analysis.entryPoint,
        },
        `BUILD_ABORTED: client closed connection for package ${packageString}`,
      )
      controller.abort()
    }

    ctx.state.analysis = {
      language: 'javascript',
      operation,
      signal: controller.signal,
    }
    ctx.res.on('close', abort)

    try {
      await next()
    } finally {
      ctx.res.off('close', abort)
    }
  }
}
