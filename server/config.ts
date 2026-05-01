import os from 'os'
import path from 'path'

const dev = false

const config = {
  tmp: path.join(__dirname, '..', 'tmp-build'),
  MAX_WORKERS: os.cpus().length,
  MAX_FAILURE_CACHE_ENTRIES: 600,
  WORKER_TIMEOUT: 600 * 1000,
  DEFAULT_DEV_PORT: 5000,
  blackList: [
    /hack-cheats/,
    /hacks?-cheats?/,
    /hack-unlimited/,
    /generator-unlimited/,
    /hack-\d+/,
    /cheat-\d+/,
    /-hacks?-/,
    /^nuxt$/,
    /^next$/,
    /^react-scripts/,
    /^polymer-cli/,
    /^parcel$/,
    /^devextreme$/,
    /^yarn$/,
    /^styled-icons$/,
    /^razzle$/,
  ],
  unsupported: [
    {
      test: /^@types\//,
      reason: "Type packages don't usually contain any runtime code.",
    },
  ],
  CACHE: {
    PUBLIC_ASSETS: dev ? 0 : 24 * 60 * 60,
    RECENTS_API: dev ? 0 : 20 * 60,
    PACKAGE_HISTORY_API: dev ? 0 : 60 * 60,
    SIMILAR_API: dev ? 0 : 60 * 60 * 2,
    SIZE_API_DEFAULT: dev ? 0 : 30,
    SIZE_API_ERROR: dev ? 0 : 60,
    SIZE_API_ERROR_FATAL: dev ? 0 : 60 * 60,
    SIZE_API_ERROR_UNSUPPORTED: dev ? 0 : 24 * 60 * 60,
    SIZE_API_HAS_VERSION: dev ? 0 : 24 * 60 * 60,
  },
} as const

export default config
