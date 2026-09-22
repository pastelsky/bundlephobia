export interface PackageIdentity {
  name: string
  version: string
}

export interface PackageMetadata extends PackageIdentity {
  description: string
  repository: string
}

export interface PackageDependencySize {
  name: string
  approximateSize: number
}

export interface PackageBuildBase extends PackageMetadata {
  size: number
  gzip: number
  dependencyCount: number
  hasSideEffects: boolean | string[]
  hasJSModule: boolean
  hasJSNext: boolean
  isModuleType: boolean
  ignoredMissingDependencies?: string[]
  dependencySizes?: PackageDependencySize[]
}

export interface PackageBuildResult extends PackageBuildBase {
  scoped?: boolean
}

export type PackageBuildInfo = PackageBuildBase

export type PackageBuildInfoSnapshot = Partial<PackageBuildInfo>

export interface PackageExportAsset {
  name: string
  gzip?: number
  type?: string
}

export type PackageExportsResult = Record<string, string>

export interface PackageExportSizesResult {
  assets: PackageExportAsset[]
}
