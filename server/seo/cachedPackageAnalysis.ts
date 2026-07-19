import axios from 'axios'

import type { PackageBuildInfo } from '../../types/package-domain'
import config from '../config'

const INTERNAL_REQUEST_TIMEOUT_MS = 6000

function getInternalApiOrigin() {
  const configuredPort = Number.parseInt(process.env.PORT ?? '', 10)
  const port =
    Number.isInteger(configuredPort) && configuredPort > 0
      ? configuredPort
      : config.DEFAULT_DEV_PORT

  return `http://127.0.0.1:${port}`
}

/**
 * Reuse the public size pipeline in cache-only mode. The `peep` flag makes a
 * cache miss return 404 before the build middleware, and omitting `record`
 * keeps SSR reads out of recent searches.
 */
export async function getCachedPackageAnalysis(
  packageString: string
): Promise<PackageBuildInfo | null> {
  const response = await axios.get<PackageBuildInfo | null>('/api/size', {
    baseURL: getInternalApiOrigin(),
    timeout: INTERNAL_REQUEST_TIMEOUT_MS,
    params: {
      package: packageString,
      peep: 'true',
    },
    headers: {
      'X-Bundlephobia-User': 'bundlephobia website',
    },
    validateStatus: status => status === 200 || status === 404,
  })

  return response.status === 200 ? response.data : null
}
