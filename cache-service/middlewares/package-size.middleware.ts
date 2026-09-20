import { parsePackageCacheResult } from '@bundlephobia/service-contracts/cache'

import { createCacheHandlers } from '../cacheHandlers.ts'
import { cacheRepositories } from '../cacheRepositories.ts'

const handlers = createCacheHandlers({
  label: 'package',
  repository: cacheRepositories.package,
  parseResult: parsePackageCacheResult,
})

export const getPackageSizeMiddlware = handlers.get

export const postPackageSizeMiddlware = handlers.post
