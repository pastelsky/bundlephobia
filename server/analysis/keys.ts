import type { LanguageId } from '../../types/language-domain'
import {
  createStorageKey,
  getLanguageStorageNamespace,
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
  const namespace = getLanguageStorageNamespace(parts.language)
  return createStorageKey({
    language: parts.language,
    operation: parts.operation,
    resultSchema:
      parts.resultSchema ?? namespace.resultSchemas[parts.operation],
    analysisProfile: parts.analysisProfile ?? namespace.analysisProfile,
    identifier: parts.packageSpecifier,
  })
}

export function createQueueType(
  language: LanguageId,
  operation: AnalysisOperation
): string {
  return `${language}:${operation}`
}
