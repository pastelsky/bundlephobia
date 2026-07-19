import type { Middleware } from 'koa'
import now from 'performance-now'

import { debug, logger } from '../../init'
import { packageSizeService } from '../../services/packageSize.service'

const packageSizeLookupMiddleware: Middleware = async (ctx, next) => {
  const startedAt = now()
  const cachePolicy = ctx.state.packageRequestPolicy.forceBuild
    ? 'bypass'
    : 'read'
  const lookup = await packageSizeService.lookupPackageSize(
    ctx.state.requestedPackage,
    cachePolicy
  )
  const time = now() - startedAt

  ctx.state.resolved = lookup.resolved
  ctx.state.packageSizeLookup = lookup

  debug('resolved to %s', lookup.resolved.packageString)
  logger.info(
    'RESOLVE_PACKAGE',
    {
      ...lookup.resolved,
      cache: lookup.kind,
      time,
      requestId: ctx.state.id,
    },
    `RESOLVED: ${lookup.resolved.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default packageSizeLookupMiddleware
