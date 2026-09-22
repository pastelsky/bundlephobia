import { parsePackageCacheResult } from '@bundlephobia/service-contracts/cache'

import { cacheConfig } from '../cache.config.ts'
import { createCacheHandlers } from '../cache.handlers.ts'
import { createCacheRepository } from '../cache.repository.ts'

const handlers = createCacheHandlers({
  label: 'package',
  repository: createCacheRepository(cacheConfig.package),
  parseResult: parsePackageCacheResult,
})

export const getPackageSizeMiddleware = handlers.get

export const postPackageSizeMiddleware = handlers.post
