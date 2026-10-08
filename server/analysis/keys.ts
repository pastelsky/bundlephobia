import type { LanguageId } from '../../types/language-domain'
import type { AnalysisOperation } from './contracts'
import { normalizeEntryPoint } from '@bundlephobia/service-contracts/package'

interface AnalysisKeyParts {
  language: LanguageId
  operation: AnalysisOperation
  packageSpecifier: string
  entryPoint?: string
}

/** A collision-safe identity for in-memory work and failure caches. */
export function createAnalysisKey(parts: AnalysisKeyParts): string {
  return JSON.stringify([
    parts.language,
    parts.operation,
    parts.packageSpecifier,
    normalizeEntryPoint(parts.entryPoint) ?? '.',
  ])
}

export function createQueueType(
  language: LanguageId,
  operation: AnalysisOperation,
): string {
  return `${language}:${operation}`
}
