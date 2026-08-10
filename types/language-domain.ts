export const LANGUAGE_IDS = ['javascript', 'java', 'kotlin'] as const

export type LanguageId = (typeof LANGUAGE_IDS)[number]

export const LANGUAGE_CAPABILITIES = [
  'analysis',
  'suggestions',
  'history',
  'recent-searches',
  'similar-packages',
  'exports',
  'export-sizes',
  'stats-image',
  'compare',
  'dependency-graph',
  'manifest-scan',
] as const

export type LanguageCapability = (typeof LANGUAGE_CAPABILITIES)[number]

export type LanguageState = 'enabled' | 'disabled'
export type LanguageVisibility = 'public' | 'hidden'

export interface LanguageDescriptor {
  id: LanguageId
  label: string
  state: LanguageState
  visibility: LanguageVisibility
  capabilities: readonly LanguageCapability[]
}

/** A package specifier before a language adapter resolves it to a version. */
export interface PackageReference<L extends LanguageId = LanguageId> {
  language: L
  specifier: string
}

/** Stable identity shared by package reports after language-specific resolution. */
export interface ResolvedPackageIdentity<
  L extends LanguageId = LanguageId,
> extends PackageReference<L> {
  name: string
  version: string
  displayName: string
  canonicalSpecifier: string
}

export type PackageReportStatus = 'complete' | 'partial' | 'failed'
export type PackageDiagnosticSeverity = 'info' | 'warning' | 'error'

export interface PackageDiagnostic {
  code: string
  message: string
  severity: PackageDiagnosticSeverity
  retryable?: boolean
}

export interface PackageReportBase<L extends LanguageId = LanguageId> {
  schemaVersion: 1
  language: L
  identity: ResolvedPackageIdentity<L>
  status: PackageReportStatus
  description?: string
  repository?: string
  diagnostics: readonly PackageDiagnostic[]
}

export interface JavaScriptDependencySize {
  name: string
  approximateSize: number
}

export interface JavaScriptPackageAnalysis {
  size: number
  gzip: number
  dependencyCount: number
  hasSideEffects: boolean | string[]
  hasJSModule: boolean
  hasJSNext: boolean
  isModuleType: boolean
  ignoredMissingDependencies?: readonly string[]
  dependencySizes?: readonly JavaScriptDependencySize[]
}

export interface JavaScriptPackageReport extends PackageReportBase<'javascript'> {
  analysis: JavaScriptPackageAnalysis
}

/**
 * The report union contains only implemented languages. Java and Kotlin stay
 * descriptor-only until their website result contracts are designed.
 */
export type PackageReport = JavaScriptPackageReport
