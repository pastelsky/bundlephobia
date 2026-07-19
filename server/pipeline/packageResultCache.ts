import type {
  PackageBuildInfo,
  PackageExportSizesResult,
  PackageIdentity,
} from '../../types/package-domain'
import Cache from '../../utils/cache.utils'

/**
 * Where one package API keeps its already-computed result, keyed by the exact
 * `name@version`. An endpoint with `null` here never persists anything and is
 * always rebuilt on request.
 */
export interface PackageResultCache<TResult> {
  get(pkg: PackageIdentity): Promise<TResult | undefined>
  set(pkg: PackageIdentity, result: TResult): Promise<void>
}

// The size and export-size APIs both read and write bundlephobia's shared
// cache service; they differ only in which slot they use for a given version.
const cache = new Cache()

export const packageSizeCache: PackageResultCache<PackageBuildInfo> = {
  get: pkg => cache.getPackageSize<PackageBuildInfo>(pkg),
  set: (pkg, result) => cache.setPackageSize(pkg, result),
}

/** The export-sizes API stores the package identity alongside the asset list. */
export type ExportSizesResult = PackageIdentity & PackageExportSizesResult

export const exportSizesCache: PackageResultCache<ExportSizesResult> = {
  get: pkg => cache.getExportsSize<ExportSizesResult>(pkg),
  set: (pkg, result) => cache.setExportsSize(pkg, result),
}
