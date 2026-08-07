import type {
  LanguageId,
  PackageReference,
  ResolvedPackageIdentity,
} from '../../types/language-domain'
import type {
  PackageBuildResult,
  PackageExportSizesResult,
  PackageExportsResult,
} from '../types'

export const ANALYSIS_OPERATIONS = [
  'package-analysis',
  'package-exports',
  'package-export-sizes',
] as const

export type AnalysisOperation = (typeof ANALYSIS_OPERATIONS)[number]

export interface AnalysisRequestOptions {
  priority: number
  signal?: AbortSignal
  onComplete?: (durationMs: number) => void
}

export interface ResolvedAnalysisPackage<L extends LanguageId = LanguageId>
  extends ResolvedPackageIdentity<L> {
  description: string
  repository: string
}

export interface PackageResolutionAdapter<L extends LanguageId = LanguageId> {
  readonly language: L
  resolvePackage(
    reference: PackageReference<L>
  ): Promise<ResolvedAnalysisPackage<L>>
  isExactVersionSpecifier(specifier: string): boolean
}

export interface PackageBuildAnalysisAdapter {
  analyzePackage(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageBuildResult>
}

export interface PackageExportsAnalysisAdapter {
  analyzePackageExports(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageExportsResult>
}

export interface PackageExportSizesAnalysisAdapter {
  analyzePackageExportSizes(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageExportSizesResult>
}

export type PackageAnalysisAdapter<L extends LanguageId = LanguageId> =
  PackageResolutionAdapter<L> &
    Partial<
      PackageBuildAnalysisAdapter &
        PackageExportsAnalysisAdapter &
        PackageExportSizesAnalysisAdapter
    >
