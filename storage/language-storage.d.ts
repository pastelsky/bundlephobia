import type { LanguageId } from '../types/language-domain'
import type { AnalysisOperation } from '../server/analysis/contracts'

export type StorageOperation =
  | AnalysisOperation
  | 'package-history'
  | 'recent-searches'

export interface FirebaseVersionedRoot {
  read: string
  write?: string
  fallback?: string
}

export interface LanguageStorageConfig {
  language: LanguageId
  enabled: boolean
  cacheVersion: {
    schema: string
    profile: string
  }
  roots: {
    packageAnalysis: FirebaseVersionedRoot
    packageExports: FirebaseVersionedRoot
    packageHistory: FirebaseVersionedRoot
    recentSearches: string
  }
}

export const JAVASCRIPT_ANALYSIS_PROFILE: string

export function getLanguageStorageConfig(
  language: LanguageId,
  env?: NodeJS.ProcessEnv
): LanguageStorageConfig

export function createStorageKey(
  storage: LanguageStorageConfig,
  operation: StorageOperation,
  identifier: string,
  version?: { schema?: string; profile?: string }
): string
