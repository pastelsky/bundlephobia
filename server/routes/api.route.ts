import Router from '@koa/router'

import type {
  CacheKey,
  ExportsCacheResult,
  PackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

import CacheServiceClient from '../clients/cache-service.client'
import { createAnalysisContextMiddleware } from '../middlewares/analysis-context.middleware'
import buildMissRateLimit from '../middlewares/build-miss-rate-limit.middleware'
import { createExportSizesMiddleware } from '../middlewares/exports-sizes.middleware'
import exportsMiddleware from '../middlewares/exports.middleware'
import { createGenerateImgMiddleware } from '../middlewares/generate-image.middleware'
import jsonCacheMiddleware from '../middlewares/json-cache.middleware'
import errorMiddleware from '../middlewares/results/error.middleware'
import blockBlacklistMiddleware from '../middlewares/results/block-blacklist.middleware'
import createCachedResponseMiddleware from '../middlewares/results/cached-response.middleware'
import failureBackoffMiddleware from '../middlewares/results/failure-backoff.middleware'
import { createBuildMiddleware } from '../middlewares/results/build-result.middleware'
import { createResolvePackageMiddleware } from '../middlewares/results/resolve-package.middleware'
import similarPackagesMiddleware from '../middlewares/similar-packages/similar-packages.middleware'
import { createMcpController } from '../controllers/mcp.controller'
import { createPackageHistoryController } from '../controllers/package-history.controller'
import { createRecentSearchesController } from '../controllers/recent-searches.controller'

export function registerApiRoutes(
  router: Router,
  dependencies: { cache: CacheServiceClient; port: number },
): void {
  const { cache, port } = dependencies
  const buildMiddleware = createBuildMiddleware(cache)
  const exportSizesMiddleware = createExportSizesMiddleware(cache)
  const generateImgMiddleware = createGenerateImgMiddleware(cache)
  const mcpController = createMcpController(port)

  router.get(
    '/api/size',
    jsonCacheMiddleware({
      get: (key: CacheKey) => cache.getPackageSize(key),
      set: (key: CacheKey, value: PackageCacheResult) =>
        cache.setPackageSize(key, value),
      hash: ctx => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    createAnalysisContextMiddleware('package-analysis'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-analysis'),
    createCachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    buildMiddleware,
  )

  router.get(
    '/api/exports',
    createAnalysisContextMiddleware('package-exports'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-exports'),
    failureBackoffMiddleware,
    exportsMiddleware,
  )

  router.get(
    '/api/exports-sizes',
    jsonCacheMiddleware({
      get: (key: CacheKey) => cache.getExportsSize(key),
      set: (key: CacheKey, value: ExportsCacheResult) =>
        cache.setExportsSize(key, value),
      hash: ctx => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    createAnalysisContextMiddleware('package-export-sizes'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-export-sizes'),
    createCachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    exportSizesMiddleware,
  )

  router.get('/api/recent', createRecentSearchesController())
  router.get('/api/package-history', createPackageHistoryController())
  router.get('/api/similar-packages', similarPackagesMiddleware)
  router.get('/api/stats-image', generateImgMiddleware)
  router.get('/api/mcp/tools', mcpController.listTools)
  router.post('/api/mcp/call-tool', mcpController.callTool)
}
