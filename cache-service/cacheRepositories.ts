import { createCacheRepository } from './cacheRepository.ts'
import { cacheConfig } from './cacheConfig.ts'

export const cacheRepositories = {
  package: createCacheRepository(cacheConfig.package),
  exports: createCacheRepository(cacheConfig.exports),
} as const
