const JAVASCRIPT_ANALYSIS_PROFILE = 'package-build-stats-v9'

function javascriptConfig(env) {
  // These root names are existing production contracts. A future result schema
  // or analysis profile must use a new root rather than reinterpreting data in
  // one of these namespaces.
  const moduleReadRoot = env.FIREBASE_READ_KEY || 'modules-v3'
  const exportReadRoot = env.FIREBASE_READ_KEY_EXPORTS || 'exports-v3'
  const fallbackEnabled = !env.DISABLE_FIREBASE_V2_FALLBACK

  return {
    language: 'javascript',
    enabled: true,
    cacheVersion: {
      schema: 'v1',
      profile: JAVASCRIPT_ANALYSIS_PROFILE,
    },
    roots: {
      packageAnalysis: {
        read: moduleReadRoot,
        write: env.FIREBASE_WRITE_KEY || 'modules-v3',
        fallback:
          moduleReadRoot === 'modules-v3' && fallbackEnabled
            ? 'modules-v2'
            : undefined,
      },
      packageExports: {
        read: exportReadRoot,
        write: env.FIREBASE_WRITE_KEY_EXPORTS || 'exports-v3',
        fallback:
          exportReadRoot === 'exports-v3' && fallbackEnabled
            ? 'exports'
            : undefined,
      },
      packageHistory: {
        read: env.FIREBASE_READ_KEY || 'modules-v2',
        fallback:
          env.FIREBASE_READ_KEY === 'modules-v3' && fallbackEnabled
            ? 'modules-v2'
            : undefined,
      },
      recentSearches: 'searches-v2',
    },
  }
}

function disabledConfig(language) {
  const prefix = `${language}-v1`
  return {
    language,
    enabled: false,
    cacheVersion: { schema: 'v1', profile: 'disabled' },
    roots: {
      packageAnalysis: {
        read: `${prefix}-modules`,
        write: `${prefix}-modules`,
      },
      packageExports: {
        read: `${prefix}-exports`,
        write: `${prefix}-exports`,
      },
      packageHistory: { read: `${prefix}-history` },
      recentSearches: `${prefix}-searches`,
    },
  }
}

function getLanguageStorageConfig(language, env = process.env) {
  switch (language) {
    case 'javascript':
      return javascriptConfig(env)
    case 'java':
    case 'kotlin':
      return disabledConfig(language)
    default:
      throw new Error(`Unknown storage language: ${language}`)
  }
}

function createStorageKey(storage, operation, identifier, version = {}) {
  return JSON.stringify([
    storage.language,
    operation,
    version.schema || storage.cacheVersion.schema,
    version.profile || storage.cacheVersion.profile,
    identifier,
  ])
}

module.exports = {
  JAVASCRIPT_ANALYSIS_PROFILE,
  createStorageKey,
  getLanguageStorageConfig,
}
