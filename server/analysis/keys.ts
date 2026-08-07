import type { LanguageId } from '../../types/language-domain'
import {
  createStorageKey,
  getLanguageStorageConfig,
} from '../../storage/language-storage'
import type { AnalysisOperation } from './contracts'

interface AnalysisKeyParts {
  language: LanguageId
  operation: AnalysisOperation
  packageSpecifier: string
  resultSchema?: string
  analysisProfile?: string
}

/** A collision-safe identity for in-memory work and failure caches. */
export function createAnalysisKey(parts: AnalysisKeyParts): string {
  const storage = getLanguageStorageConfig(parts.language)
  return createStorageKey(storage, parts.operation, parts.packageSpecifier, {
    schema: parts.resultSchema,
    profile: parts.analysisProfile,
  })
}

export function createQueueType(
  language: LanguageId,
  operation: AnalysisOperation
): string {
  return `${language}:${operation}`
}
