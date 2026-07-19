import type { Middleware } from 'koa'
import now from 'performance-now'

import { debug, logger } from '../../init'
import { resolvePackageRequest } from '../../services/packageResolution.service'

// Resolves normalized package input to one exact npm version and publishes it
// for the endpoint's cache/build stages downstream.
const resolvePackageMiddleware: Middleware = async (ctx, next) => {
  const startedAt = now()
  const resolvedPackage = await resolvePackageRequest(ctx.state.packageRequest)
  const time = now() - startedAt
  ctx.state.resolvedPackage = resolvedPackage

  debug('resolved to %s', resolvedPackage.packageString)
  logger.info(
    'RESOLVE_PACKAGE',
    { ...resolvedPackage, time, requestId: ctx.state.id },
    `RESOLVED: ${resolvedPackage.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default resolvePackageMiddleware
