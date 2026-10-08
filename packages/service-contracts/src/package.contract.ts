import { z } from 'zod'

export const ENTRY_POINT_HEADER = 'x-bundlephobia-entry-point'

/** Canonical public import paths, not filesystem paths or wildcard patterns. */
export const packageEntryPointSchema = z
  .string()
  .max(1024)
  .refine(
    value =>
      value === '.' ||
      (value.startsWith('./') &&
        !/[\\*?#\p{Cc}]/u.test(value) &&
        value
          .slice(2)
          .split('/')
          .every(part => part && part !== '.' && part !== '..')),
  )

export function normalizeEntryPoint(entryPoint?: string): string | undefined {
  return entryPoint === '.' ? undefined : entryPoint
}

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
  entryPoint?: string
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

export interface PackageEntryPointsResult extends PackageIdentity {
  entryPoints: string[]
}
