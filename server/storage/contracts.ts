import type { LanguageId } from '../../types/language-domain'
import type { PackageIdentity } from '../../types/package-domain'

export interface PackageResultStore {
  get<T>(identity: PackageIdentity): Promise<T | undefined>
  set<T>(identity: PackageIdentity, result: T): Promise<void>
}

export interface PackageHistoryStore {
  get(name: string, limit?: number): Promise<Record<string, unknown>>
}

export interface RecentSearchStore {
  record(name: string, packageInfo: PackageIdentity): void
  recent(
    limit?: number
  ): Promise<Record<string, unknown>> | Record<string, unknown>
  daily(): Promise<Record<string, unknown>>
}

export interface LanguageStorageAdapter<L extends LanguageId = LanguageId> {
  readonly language: L
  readonly packageAnalysis?: PackageResultStore
  readonly exportSizes?: PackageResultStore
  readonly packageHistory?: PackageHistoryStore
  readonly recentSearches?: RecentSearchStore
}
