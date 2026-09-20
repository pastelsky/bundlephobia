import { parseExportsCacheResult } from '@bundlephobia/service-contracts/cache'

import { cacheConfig } from '../cache.config.ts'
import { createCacheHandlers } from '../cache.handlers.ts'
import { createCacheRepository } from '../cache.repository.ts'

const handlers = createCacheHandlers({
  label: 'exports',
  repository: createCacheRepository(cacheConfig.exports),
  parseResult: parseExportsCacheResult,
})

export const getExportsSizeMiddleware = handlers.get

export const postExportsSizeMiddleware = handlers.post
