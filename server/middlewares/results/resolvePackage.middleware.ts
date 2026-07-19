import type { Middleware } from 'koa'
import now from 'performance-now'

import { debug, logger } from '../../init'
import { resolvePackageRequest } from '../../services/packageResolution.service'

// Resolves normalized package input to one exact npm package version.
// Publishes that resolved package for endpoint-specific work downstream.
const resolvePackageMiddleware: Middleware = async (ctx, next) => {
  const resolveStart = now()
  const resolvedPackage = await resolvePackageRequest(ctx.state.packageRequest)
  const resolveEnd = now()
  ctx.state.resolvedPackage = resolvedPackage

  debug('resolved to %s', resolvedPackage.packageString)
  const time = resolveEnd - resolveStart
  logger.info(
    'RESOLVE_PACKAGE',
    { ...resolvedPackage, time, requestId: ctx.state.id },
    `RESOLVED: ${resolvedPackage.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default resolvePackageMiddleware
