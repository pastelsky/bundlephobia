import 'dotenv-defaults/config.js'

export interface CacheRepositoryConfig {
  readKey: string
  writeKey: string
  fallbackReadKey?: string
  memoryMax: number
}

const packageReadKey = process.env.FIREBASE_READ_KEY || 'modules-v3'

const exportsReadKey = process.env.FIREBASE_READ_KEY_EXPORTS || 'exports-v3'

export const cacheConfig = {
  package: {
    readKey: packageReadKey,
    writeKey: process.env.FIREBASE_WRITE_KEY || 'modules-v3',
    fallbackReadKey:
      packageReadKey === 'modules-v3' &&
      !process.env.DISABLE_FIREBASE_V2_FALLBACK
        ? 'modules-v2'
        : undefined,
    memoryMax: 3000,
  },
  exports: {
    readKey: exportsReadKey,
    writeKey: process.env.FIREBASE_WRITE_KEY_EXPORTS || 'exports-v3',
    fallbackReadKey:
      exportsReadKey === 'exports-v3' &&
      !process.env.DISABLE_FIREBASE_V2_FALLBACK
        ? 'exports'
        : undefined,
    memoryMax: 1500,
  },
} as const satisfies Record<'package' | 'exports', CacheRepositoryConfig>
