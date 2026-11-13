import { createJavaScriptPackageReference } from '../../languages/javascript'
import { packageAnalysisGateway } from '../analysis'
import config from '../config'

// HTTP freshness for build results; stored results have independent retention.
export function getBuildCacheMaxAge(
  force: string | string[] | undefined,
  packageQuery: string | string[] | undefined,
): number {
  if (force !== undefined && force !== null) return 0

  const requestedPackage = Array.isArray(packageQuery)
    ? packageQuery.join('/')
    : packageQuery

  return requestedPackage &&
    packageAnalysisGateway.isExactVersionSpecifier(
      createJavaScriptPackageReference(requestedPackage),
    )
    ? config.CACHE.SIZE_API_HAS_VERSION
    : config.CACHE.SIZE_API_DEFAULT
}
