import { parseExportsCacheResult } from '@bundlephobia/service-contracts/cache'

import { cacheConfig } from '../cacheConfig.ts'
import { createCacheHandlers } from '../cacheHandlers.ts'
import { createCacheRepository } from '../cacheRepository.ts'

const handlers = createCacheHandlers({
  label: 'exports',
  repository: createCacheRepository(cacheConfig.exports),
  parseResult: parseExportsCacheResult,
})

export const getExportsSizeMiddlware = handlers.get

export const postExportsSizeMiddleware = handlers.post
