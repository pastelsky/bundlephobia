import semver from 'semver'

import { getLanguageStorageNamespace } from '../../storage/language-storage'
import type {
  LanguageStorageAdapter,
  VersionOrderingCapability,
} from './contracts'

export const javaScriptVersionOrdering: VersionOrderingCapability = {
  selectHistoryVersions(versions, limit) {
    const filteredVersions = versions
      .filter(version => !version.includes('-'))
      .sort((versionA, versionB) => semver.compare(versionA, versionB))

    const limitedVersions = filteredVersions.slice(
      Math.max(filteredVersions.length - limit, 0)
    )

    const latestVersion = versions[versions.length - 1]
    if (latestVersion?.includes('-')) {
      limitedVersions.shift()
      limitedVersions.push(latestVersion)
    }

    return limitedVersions
  },
}

export function createJavaScriptStorageAdapter(
  env: NodeJS.ProcessEnv = process.env
): LanguageStorageAdapter {
  return {
    language: 'javascript',
    namespace: getLanguageStorageNamespace('javascript', env),
    versionOrdering: javaScriptVersionOrdering,
  }
}
