import type { Middleware } from 'koa'

import type { PackageIdentity } from '../../types/package-domain'
import firebaseUtils from '../../utils/firebase.utils'
import { getRequestPriority } from '../../utils/server.utils'
import {
  getExactRequestedVersion,
  requireResolvedPackage,
} from '../services/packageResolution.service'
import { sizeCacheMaxAge } from './cachePolicy'
import type { PackageEndpoint } from './packageEndpoints'

/**
 * Builds the endpoint's result for the resolved package, persists it to the
 * endpoint's cache (if any), and returns it — the shared final step reached
 * only after every cache stage missed.
 */
export function buildAndStore<TResult extends PackageIdentity>(
  endpoint: PackageEndpoint<TResult>
): Middleware {
  return async ctx => {
    const { cacheMode } = ctx.state.packageRequest
    const resolvedPackage = requireResolvedPackage(ctx.state.resolvedPackage)
    const priority = getRequestPriority(ctx)

    const result = await endpoint.build(ctx, resolvedPackage, priority)

    if (endpoint.cache) {
      await endpoint.cache.set(resolvedPackage, result)
    }

    ctx.cacheControl = {
      maxAge: sizeCacheMaxAge(
        cacheMode,
        getExactRequestedVersion(ctx.state.packageRequest) !== null
      ),
    }
    ctx.body = result

    if (endpoint.recordRecentSearch && ctx.query.record === 'true') {
      firebaseUtils.setRecentSearch(resolvedPackage.name, {
        name: resolvedPackage.name,
        version: resolvedPackage.version,
      })
    }
  }
}
