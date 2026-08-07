import type { LanguageId } from '../../types/language-domain'
import { getLanguageStorageNamespace } from '../../storage/language-storage'
import type { LanguageStorageAdapter } from './contracts'
import { createJavaScriptStorageAdapter } from './javascript'

export function createLanguageStorageAdapters(
  env: NodeJS.ProcessEnv = process.env
): ReadonlyMap<LanguageId, LanguageStorageAdapter> {
  const adapters = new Map<LanguageId, LanguageStorageAdapter>([
    ['javascript', createJavaScriptStorageAdapter(env)],
    [
      'java',
      {
        language: 'java',
        namespace: getLanguageStorageNamespace('java', env),
      },
    ],
    [
      'kotlin',
      {
        language: 'kotlin',
        namespace: getLanguageStorageNamespace('kotlin', env),
      },
    ],
  ])

  const rootOwners = new Map<string, LanguageId>()
  adapters.forEach(adapter => {
    const { namespace } = adapter
    if (namespace.language !== adapter.language) {
      throw new Error(`Storage namespace mismatch: ${adapter.language}`)
    }
    if (!namespace.enabled && namespace.writesEnabled) {
      throw new Error(`Disabled storage cannot write: ${adapter.language}`)
    }

    const roots = new Set(
      [
        namespace.roots.packageAnalysis.read,
        namespace.roots.packageAnalysis.write,
        namespace.roots.packageAnalysis.fallback,
        namespace.roots.packageExports.read,
        namespace.roots.packageExports.write,
        namespace.roots.packageExports.fallback,
        namespace.roots.packageHistory.read,
        namespace.roots.packageHistory.fallback,
        namespace.roots.recentSearches,
      ].filter((root): root is string => Boolean(root))
    )
    roots.forEach(root => {
      const owner = rootOwners.get(root)
      if (owner && owner !== adapter.language) {
        throw new Error(
          `Storage root ${root} is shared by ${owner} and ${adapter.language}`
        )
      }
      rootOwners.set(root, adapter.language)
    })
  })

  return adapters
}

const adapters = createLanguageStorageAdapters()

export function getLanguageStorageAdapter(
  language: LanguageId
): LanguageStorageAdapter {
  const adapter = adapters.get(language)
  if (!adapter) throw new Error(`Missing storage adapter: ${language}`)
  return adapter
}
