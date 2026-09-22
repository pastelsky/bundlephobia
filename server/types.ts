// Server-specific types only.
import type { PackageMetadata } from '@bundlephobia/service-contracts/package'
import type { LanguageId } from '../types/language-domain'
import type {
  AnalysisOperation,
  ResolvedAnalysisPackage,
} from './analysis/contracts'

/**
 * State attached to Koa's `ctx.state.resolved` after the
 * resolve-package middleware runs.  Extends the public metadata
 * fields with server-only routing information.
 */
export interface ResolvedPackageState
  extends PackageMetadata, ResolvedAnalysisPackage {
  scoped: boolean
  packageString: string
}

export interface PackageAnalysisRequestState {
  language: LanguageId
  operation: AnalysisOperation
}

export interface FailureCacheEntry {
  status: number
  body: unknown
  consecutiveFailures: number
  blockedUntil?: number
}
