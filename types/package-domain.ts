// ============================================================
// DOMAIN TYPES — single source of truth for package concepts.
// All server / client types must import from here and either
// re-export or compose, never duplicate field-for-field.
// ============================================================

// ── Identity & Metadata ──────────────────────────────────────

export interface PackageIdentity {
  name: string
  version: string
}

export interface PackageMetadata extends PackageIdentity {
  description: string
  repository: string
}

// ── Build result ─────────────────────────────────────────────

export interface PackageDependencySize {
  name: string
  approximateSize: number
}

/**
 * Core build-result shape.  Every field that comes back from the
 * build worker lives here.  Both server and client derive their
 * own types from this base.
 */
export interface PackageBuildBase extends PackageMetadata {
  size: number
  gzip: number
  dependencyCount: number
  /** `false` → none; `true` → yes (unknown files); `string[]` → specific files */
  hasSideEffects: boolean | string[]
  hasJSModule: boolean
  hasJSNext: boolean
  isModuleType: boolean
  ignoredMissingDependencies?: string[]
  dependencySizes?: PackageDependencySize[]
}

/**
 * Server-side build result.  Adds `scoped` which is resolved
 * during package-string parsing and is a server-only concern.
 */
export interface PackageBuildResult extends PackageBuildBase {
  scoped?: boolean
}

/**
 * Client-facing package info.  Structurally identical to
 * `PackageBuildBase`; the alias makes consumer intent explicit.
 */
export type PackageBuildInfo = PackageBuildBase

/** Partial snapshot used in the version-history API. */
export type PackageBuildInfoSnapshot = Partial<PackageBuildInfo>

// ── Exports ──────────────────────────────────────────────────

export interface PackageExportAsset {
  name: string
  gzip?: number
  type?: string
}

/** Map of export name → resolved file path. */
export type PackageExportsResult = Record<string, string>

export interface PackageExportSizesResult {
  assets: PackageExportAsset[]
}
