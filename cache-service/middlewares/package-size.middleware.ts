import { parsePackageCacheResult } from '@bundlephobia/service-contracts/cache'

import { cacheConfig } from '../cacheConfig.ts'
import { createCacheHandlers } from '../cacheHandlers.ts'
import { createCacheRepository } from '../cacheRepository.ts'

const handlers = createCacheHandlers({
  label: 'package',
  repository: createCacheRepository(cacheConfig.package),
  parseResult: parsePackageCacheResult,
})

export const getPackageSizeMiddlware = handlers.get

export const postPackageSizeMiddlware = handlers.post
