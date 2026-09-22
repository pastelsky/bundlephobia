import { z } from 'zod'

import type {
  CacheEntry,
  CacheKey,
  CacheValue,
  CacheRequestBody,
  ExportsCacheResult,
  PackageCacheResult,
} from './cache.type.ts'

export const cacheValueSchema: z.ZodType<CacheValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(cacheValueSchema),
    z.record(z.string(), cacheValueSchema),
  ]),
)

const cacheEntrySchema: z.ZodType<CacheEntry> = cacheValueSchema.refine(
  (value): value is CacheEntry => value !== null,
)

const cacheKeySchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
  })
  .strict()

const packageCacheResultSchema = cacheKeySchema
  .extend({
    size: z.number().finite(),
    gzip: z.number().finite(),
  })
  .catchall(cacheValueSchema)

const exportsCacheResultSchema = cacheKeySchema
  .extend({
    assets: z.array(
      z
        .object({
          name: z.string().min(1),
          gzip: z.number().finite().optional(),
          type: z.string().optional(),
        })
        .catchall(cacheValueSchema),
    ),
  })
  .catchall(cacheValueSchema)

const cacheRequestBodySchema = cacheKeySchema
  .extend({ result: cacheEntrySchema })
  .strict()

export function isCacheValue(value: CacheValue): value is CacheValue {
  return cacheValueSchema.safeParse(value).success
}

export function isCacheEntry(value: CacheValue): value is CacheEntry {
  return cacheEntrySchema.safeParse(value).success
}

export function parseCacheKey(value: CacheValue): CacheKey | null {
  const result = cacheKeySchema.safeParse(value)

  return result.success ? result.data : null
}

export function parsePackageCacheResult(
  value: CacheValue,
): PackageCacheResult | null {
  const result = packageCacheResultSchema.safeParse(value)

  return result.success ? result.data : null
}

export function parseExportsCacheResult(
  value: CacheValue,
): ExportsCacheResult | null {
  const result = exportsCacheResultSchema.safeParse(value)

  return result.success ? result.data : null
}

export function parseCacheRequestBody(
  value: CacheValue,
): CacheRequestBody | null {
  const result = cacheRequestBodySchema.safeParse(value)

  return result.success ? result.data : null
}
