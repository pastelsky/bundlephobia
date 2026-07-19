import type { Middleware } from 'koa'

import type { PackageIdentity } from '../../types/package-domain'
import buildMissRateLimit from '../middlewares/buildMissRateLimit.middleware'
import blockBlacklistMiddleware from '../middlewares/results/blockBlacklist.middleware'
import errorMiddleware from '../middlewares/results/error.middleware'
import packageRequestMiddleware from '../middlewares/results/packageRequest.middleware'
import { buildAndStore } from './buildAndStore.middleware'
import type { PackageEndpoint } from './packageEndpoints'
import { resolveAndServeCached } from './resolveAndServeCached.middleware'

/**
 * The single, linear flow every package API follows:
 *
 *   parse request → error boundary → blocklist guard →
 *   resolve + serve cache → (miss only) rate limit → build + store
 *
 * Endpoints differ only in their descriptor (what to build, which cache,
 * whether misses are rate limited), never in this ordering.
 */
export function packageApiPipeline<TResult extends PackageIdentity>(
  endpoint: PackageEndpoint<TResult>
): Middleware[] {
  return [
    packageRequestMiddleware,
    errorMiddleware,
    blockBlacklistMiddleware,
    resolveAndServeCached(endpoint.cache),
    ...(endpoint.rateLimitMisses
      ? [
          buildMissRateLimit({
            durationMs: 1000 * 60 * 5,
            maxRequests: 10,
            whiteList: ['127.0.0.1', '::1'],
          }),
        ]
      : []),
    buildAndStore(endpoint),
  ]
}
