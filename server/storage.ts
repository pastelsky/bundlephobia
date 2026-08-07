import semver from 'semver'

import type { LanguageId } from '../types/language-domain'
import {
  getLanguageStorageConfig,
  type LanguageStorageConfig,
} from '../storage/language-storage'

export interface LanguageStorageAdapter extends LanguageStorageConfig {
  selectHistoryVersions?: (
    versions: readonly string[],
    limit: number
  ) => string[]
}

function selectJavaScriptHistoryVersions(
  versions: readonly string[],
  limit: number
): string[] {
  const stableVersions = versions
    .filter(version => !version.includes('-'))
    .sort(semver.compare)
  const selected = stableVersions.slice(
    Math.max(stableVersions.length - limit, 0)
  )
  const latestVersion = versions[versions.length - 1]

  if (latestVersion?.includes('-')) {
    selected.shift()
    selected.push(latestVersion)
  }

  return selected
}

export function getLanguageStorageAdapter(
  language: LanguageId,
  env: NodeJS.ProcessEnv = process.env
): LanguageStorageAdapter {
  const storage = getLanguageStorageConfig(language, env)
  return language === 'javascript'
    ? { ...storage, selectHistoryVersions: selectJavaScriptHistoryVersions }
    : storage
}
