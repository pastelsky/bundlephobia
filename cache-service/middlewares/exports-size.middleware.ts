import { parseExportsCacheResult } from '@bundlephobia/service-contracts/cache'

import { createCacheHandlers } from '../cacheHandlers.ts'
import { cacheRepositories } from '../cacheRepositories.ts'

const handlers = createCacheHandlers({
  label: 'exports',
  repository: cacheRepositories.exports,
  parseResult: parseExportsCacheResult,
})

export const getExportsSizeMiddlware = handlers.get

export const postExportsSizeMiddleware = handlers.post
