// Server-specific types only.
// Domain types (PackageBuildResult, PackageExports*, etc.) are
// re-exported from here so callers need only one import site.
import type { PackageBuildInfo, PackageMetadata } from '../types/package-domain'
import type { ParsedPackageString } from '../utils/common.utils'
import type { PackageCacheMode } from '../utils/packageApi.utils'

export type {
  PackageBuildResult,
  PackageDependencySize,
  PackageExportAsset,
  PackageExportsResult,
  PackageExportSizesResult,
} from '../types/package-domain'

/**
 * Exact npm package identity and metadata produced by resolution.
 * Missing npm metadata remains null across server and client workflows.
 */
export interface ResolvedPackage extends PackageMetadata {
  scoped: boolean
  packageString: string
}

/** Normalized package input and cache behavior for one API or page request. */
export interface PackageRequest extends ParsedPackageString {
  packageString: string
  cacheMode: PackageCacheMode
}

export type PackageSizeCacheResult =
  | {
      kind: 'cache-hit'
      resolvedPackage: ResolvedPackage
      result: PackageBuildInfo
    }
  | {
      kind: 'cache-miss'
      resolvedPackage: ResolvedPackage
    }

export interface FailureCacheEntry {
  status: number
  body: unknown
}
