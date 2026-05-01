// Server-specific types only.
// Domain types (PackageBuildResult, PackageExports*, etc.) are
// re-exported from here so callers need only one import site.
import type { PackageMetadata } from '../types/package-domain'

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

export interface FailureCacheEntry {
  status: number
  body: unknown
}
