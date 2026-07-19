// Server-specific types only.
// Domain types (PackageBuildResult, PackageExports*, etc.) are
// re-exported from here so callers need only one import site.
import type { PackageBuildInfo, PackageMetadata } from '../types/package-domain'
import type { ParsedPackageString } from '../utils/common.utils'

export type {
  PackageBuildResult,
  PackageDependencySize,
  PackageExportAsset,
  PackageExportsResult,
  PackageExportSizesResult,
} from '../types/package-domain'

/**
 * State attached to Koa's `ctx.state.resolved` after the
 * resolve-package middleware runs.  Extends the public metadata
 * fields with server-only routing information.
 */
export interface ResolvedPackageState extends PackageMetadata {
  scoped: boolean
  packageString: string
}

/** The package identity parsed from the incoming HTTP or page request. */
export interface RequestedPackage extends ParsedPackageString {
  packageString: string
}

export type PackageSizeLookup =
  | {
      kind: 'cache-hit'
      resolved: ResolvedPackageState
      result: PackageBuildInfo
    }
  | {
      kind: 'cache-miss'
      resolved: ResolvedPackageState
    }

export interface FailureCacheEntry {
  status: number
  body: unknown
}
