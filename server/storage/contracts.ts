import type { LanguageId } from '../../types/language-domain'
import type { LanguageStorageNamespace } from '../../storage/language-storage'

export interface VersionOrderingCapability {
  selectHistoryVersions(versions: readonly string[], limit: number): string[]
}

export interface LanguageStorageAdapter {
  language: LanguageId
  namespace: LanguageStorageNamespace
  versionOrdering?: VersionOrderingCapability
}
