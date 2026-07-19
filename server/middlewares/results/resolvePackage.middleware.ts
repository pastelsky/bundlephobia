import type { Middleware } from 'koa'
import now from 'performance-now'

import { debug, logger } from '../../init'
import { resolveRequestedPackage } from '../../services/packageResolution.service'

const resolvePackageMiddleware: Middleware = async (ctx, next) => {
  const resolveStart = now()
  const resolved = await resolveRequestedPackage(ctx.state.requestedPackage)
  const resolveEnd = now()
  ctx.state.resolved = resolved

  debug('resolved to %s', resolved.packageString)
  const time = resolveEnd - resolveStart
  logger.info(
    'RESOLVE_PACKAGE',
    { ...resolved, time, requestId: ctx.state.id },
    `RESOLVED: ${resolved.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default resolvePackageMiddleware
