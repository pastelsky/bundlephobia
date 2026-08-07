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

export interface LanguageStorageNamespace {
  language: LanguageId
  enabled: boolean
  writesEnabled: boolean
  analysisProfile: string
  resultSchemas: Readonly<Record<StorageOperation, string>>
  roots: {
    packageAnalysis: FirebaseVersionedRoot
    packageExports: FirebaseVersionedRoot
    packageHistory: FirebaseVersionedRoot
    recentSearches: string
  }
}

export const JAVASCRIPT_ANALYSIS_PROFILE: string
export const RESULT_SCHEMAS: Readonly<Record<StorageOperation, string>>
export const STORAGE_OPERATIONS: readonly StorageOperation[]

export function getLanguageStorageNamespace(
  language: LanguageId,
  env?: NodeJS.ProcessEnv
): LanguageStorageNamespace

export function createStorageKey(parts: {
  language: LanguageId
  operation: StorageOperation
  resultSchema: string
  analysisProfile: string
  identifier: string
}): string

export function createNamespaceStorageKey(
  namespace: LanguageStorageNamespace,
  operation: StorageOperation,
  identifier: string
): string
