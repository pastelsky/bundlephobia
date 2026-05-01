export interface ResolvedPackageState {
  name: string
  version: string
  scoped: boolean
  packageString: string
  description: string
  repository: string
}

export interface PackageBuildResult {
  name: string
  description: string
  repository: string
  version: string
  scoped?: boolean
  size: number
  gzip: number
  dependencyCount: number
  hasSideEffects: boolean | string[]
  hasJSModule: boolean
  hasJSNext: boolean
  isModuleType: boolean
  ignoredMissingDependencies?: string[]
  dependencySizes?: Array<{
    name: string
    approximateSize: number
  }>
}

export interface PackageExportsResult {
  [exportName: string]: string
}

export interface PackageExportSizesResult {
  assets: Array<{
    name: string
    gzip?: number
    type?: string
  }>
}

export interface FailureCacheEntry {
  status: number
  body: unknown
}
