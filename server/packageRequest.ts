import { parsePackageString } from '../utils/common.utils'
import type { RequestedPackage, ResolvedPackageState } from './types'

export function createRequestedPackage(
  packageString: string
): RequestedPackage {
  return {
    ...parsePackageString(packageString),
    packageString,
  }
}

export function createPendingPackageResolution(
  requestedPackage: RequestedPackage
): ResolvedPackageState {
  const version = requestedPackage.version ?? 'latest'

  return {
    name: requestedPackage.name,
    version,
    scoped: requestedPackage.scoped,
    description: '',
    repository: '',
    packageString: `${requestedPackage.name}@${version}`,
  }
}
