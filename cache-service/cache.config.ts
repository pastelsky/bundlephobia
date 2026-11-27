import 'dotenv-defaults/config.js'

export interface CacheRepositoryConfig {
  readKey: string
  writeKey: string
  fallbackReadKey?: string
  memoryMax: number
}

function parsePositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const packageReadKey = process.env.FIREBASE_READ_KEY || 'modules-v3'

const exportsReadKey = process.env.FIREBASE_READ_KEY_EXPORTS || 'exports-v3'

export const cacheConfig = {
  package: {
    readKey: packageReadKey,
    writeKey: process.env.FIREBASE_WRITE_KEY || 'modules-v3',
    memoryMax: parsePositiveIntEnv(
      process.env.CACHE_MEMORY_MAX_PACKAGES,
      50_000,
    ),
  },
  exports: {
    readKey: exportsReadKey,
    writeKey: process.env.FIREBASE_WRITE_KEY_EXPORTS || 'exports-v3',
    memoryMax: parsePositiveIntEnv(
      process.env.CACHE_MEMORY_MAX_EXPORTS,
      20_000,
    ),
  },
} as const satisfies Record<'package' | 'exports', CacheRepositoryConfig>
