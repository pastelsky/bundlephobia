import axios from 'axios'

import {
  createNamespaceStorageKey,
  createStorageKey,
  getLanguageStorageNamespace,
} from '../storage/language-storage'
import { createAnalysisKey } from '../server/analysis/keys'
import { createJavaScriptStorageAdapter } from '../server/storage/javascript'
import { createLanguageStorageAdapters } from '../server/storage/registry'
import { FirebaseUtils } from '../utils/firebase.utils'

const packageCacheMiddleware = require('../cache-service/middlewares/package-size.middleware')
const exportCacheMiddleware = require('../cache-service/middlewares/exports-size.middleware')

describe('language storage namespaces', () => {
  it('keeps JavaScript on the existing Firebase roots and fallbacks', () => {
    const namespace = getLanguageStorageNamespace('javascript', {})

    expect(namespace).toMatchObject({
      language: 'javascript',
      enabled: true,
      writesEnabled: true,
      roots: {
        packageAnalysis: {
          read: 'modules-v3',
          write: 'modules-v3',
          fallback: 'modules-v2',
        },
        packageExports: {
          read: 'exports-v3',
          write: 'exports-v3',
          fallback: 'exports',
        },
        packageHistory: { read: 'modules-v2' },
        recentSearches: 'searches-v2',
      },
    })
  })

  it('preserves every existing JavaScript environment override', () => {
    const namespace = getLanguageStorageNamespace('javascript', {
      FIREBASE_READ_KEY: 'custom-modules',
      FIREBASE_WRITE_KEY: 'custom-module-writes',
      FIREBASE_READ_KEY_EXPORTS: 'custom-exports',
      FIREBASE_WRITE_KEY_EXPORTS: 'custom-export-writes',
      DISABLE_FIREBASE_V2_FALLBACK: 'true',
    })

    expect(namespace.roots).toEqual({
      packageAnalysis: {
        read: 'custom-modules',
        write: 'custom-module-writes',
      },
      packageExports: {
        read: 'custom-exports',
        write: 'custom-export-writes',
      },
      packageHistory: { read: 'custom-modules' },
      recentSearches: 'searches-v2',
    })
  })

  it('reserves isolated roots for disabled Java and Kotlin adapters', () => {
    const adapters = createLanguageStorageAdapters({})
    const namespaces = [...adapters.values()].map(adapter => adapter.namespace)
    const java = adapters.get('java')!.namespace
    const kotlin = adapters.get('kotlin')!.namespace
    const allRoots = namespaces.flatMap(namespace => [
      namespace.roots.packageAnalysis.read,
      namespace.roots.packageExports.read,
      namespace.roots.packageHistory.read,
      namespace.roots.recentSearches,
    ])

    expect(java).toMatchObject({ enabled: false, writesEnabled: false })
    expect(kotlin).toMatchObject({ enabled: false, writesEnabled: false })
    expect(new Set(allRoots).size).toBe(allRoots.length)
  })

  it('rejects an environment override that collides with another language', () => {
    expect(() =>
      createLanguageStorageAdapters({
        FIREBASE_READ_KEY: 'java-v1-modules',
      })
    ).toThrow('Storage root java-v1-modules is shared by javascript and java')
  })
})

describe('storage cache identities', () => {
  it('binds cache-service reads and writes to the existing JavaScript roots', () => {
    expect(
      packageCacheMiddleware.storageNamespace.roots.packageAnalysis
    ).toEqual({
      read: 'modules-v3',
      write: 'modules-v3',
      fallback: 'modules-v2',
    })
    expect(exportCacheMiddleware.storageNamespace.roots.packageExports).toEqual(
      {
        read: 'exports-v3',
        write: 'exports-v3',
        fallback: 'exports',
      }
    )
  })

  it('cannot collide across language, operation, schema, or profile', () => {
    const base = {
      language: 'javascript' as const,
      operation: 'package-analysis' as const,
      resultSchema: 'analysis-v1',
      analysisProfile: 'default',
      identifier: '@scope/example@1.0.0',
    }
    const keys = [
      createStorageKey(base),
      createStorageKey({ ...base, language: 'java' }),
      createStorageKey({ ...base, operation: 'package-exports' }),
      createStorageKey({ ...base, resultSchema: 'analysis-v2' }),
      createStorageKey({ ...base, analysisProfile: 'experimental' }),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses schema- and profile-aware identities for queue and failure keys', () => {
    const packageSpecifier = 'example@1.0.0'
    const defaultKey = createAnalysisKey({
      language: 'javascript',
      operation: 'package-analysis',
      packageSpecifier,
    })
    const schemaKey = createAnalysisKey({
      language: 'javascript',
      operation: 'package-analysis',
      packageSpecifier,
      resultSchema: 'javascript-package-analysis-v2',
    })
    const profileKey = createAnalysisKey({
      language: 'javascript',
      operation: 'package-analysis',
      packageSpecifier,
      analysisProfile: 'package-build-stats-v10',
    })

    expect(new Set([defaultKey, schemaKey, profileKey]).size).toBe(3)
  })

  it('uses the same complete identity for cache-service memory keys', () => {
    const namespace = getLanguageStorageNamespace('javascript', {})
    expect(
      JSON.parse(
        createNamespaceStorageKey(
          namespace,
          'package-export-sizes',
          'example@1.0.0'
        )
      )
    ).toEqual([
      'javascript',
      'package-export-sizes',
      namespace.resultSchemas['package-export-sizes'],
      namespace.analysisProfile,
      'example@1.0.0',
    ])
    expect(packageCacheMiddleware.getMemoryKey('example', '1.0.0')).toBe(
      createNamespaceStorageKey(namespace, 'package-analysis', 'example@1.0.0')
    )
    expect(exportCacheMiddleware.getMemoryKey('example', '1.0.0')).toBe(
      createNamespaceStorageKey(
        namespace,
        'package-export-sizes',
        'example@1.0.0'
      )
    )
  })
})

describe('JavaScript history behavior', () => {
  it('retains semver ordering and latest prerelease behavior in the adapter', () => {
    const ordering = createJavaScriptStorageAdapter({}).versionOrdering!

    expect(
      ordering.selectHistoryVersions(
        ['1.0.0', '2.0.0', '1.5.0', '3.0.0-beta.1'],
        3
      )
    ).toEqual(['1.5.0', '2.0.0', '3.0.0-beta.1'])
  })
})

describe('disabled-language Firebase safety', () => {
  it.each(['java', 'kotlin'] as const)(
    'does not initialize or write Firebase for %s',
    async language => {
      const database = jest.fn()
      const firebase = { database }
      const storage = createLanguageStorageAdapters({}).get(language)!
      const utils = new FirebaseUtils(firebase as never, true, storage)

      utils.setRecentSearch('example', { name: 'example', version: '1.0.0' })

      expect(database).not.toHaveBeenCalled()
      await expect(utils.getPackageHistory('example')).resolves.toEqual({})
      expect(utils.getRecentSearches()).toEqual({})
      expect(database).not.toHaveBeenCalled()
    }
  )

  it('reads JavaScript history only from the existing root', async () => {
    const visitedPaths: string[] = []
    const firebase = createFirebaseStub(visitedPaths, {
      'modules-v2/example': { '1,0,0': { size: 1 } },
    })
    jest.spyOn(axios, 'get').mockRejectedValueOnce(new Error('offline'))
    const utils = new FirebaseUtils(
      firebase as never,
      true,
      createJavaScriptStorageAdapter({})
    )

    await expect(utils.getPackageHistory('example', 1)).resolves.toEqual({
      '1.0.0': { size: 1 },
    })
    expect(visitedPaths).toEqual(['modules-v2/example'])
  })

  it('writes JavaScript recent searches only to the existing root', async () => {
    const visitedPaths: string[] = []
    const writePaths: string[] = []
    const firebase = createFirebaseStub(visitedPaths, {}, writePaths)
    const utils = new FirebaseUtils(
      firebase as never,
      true,
      createJavaScriptStorageAdapter({})
    )

    utils.setRecentSearch('example', { name: 'example', version: '1.0.0' })
    await new Promise(resolve => setImmediate(resolve))

    expect(visitedPaths).toEqual(['searches-v2/example'])
    expect(writePaths).toEqual(['searches-v2/example'])
  })
})

function createFirebaseStub(
  visitedPaths: string[],
  values: Record<string, unknown>,
  writePaths: string[] = []
) {
  class Reference {
    constructor(private readonly parts: string[] = []) {}
    child(part: string) {
      return new Reference([...this.parts, part])
    }
    once() {
      const path = this.parts.join('/')
      visitedPaths.push(path)
      return Promise.resolve({ val: () => values[path] ?? null })
    }
    set() {
      writePaths.push(this.parts.join('/'))
      return Promise.resolve()
    }
    update() {
      writePaths.push(this.parts.join('/'))
      return Promise.resolve()
    }
  }

  return {
    database: () => ({ ref: () => new Reference() }),
  }
}
