const STORAGE_OPERATIONS = Object.freeze([
  'package-analysis',
  'package-exports',
  'package-export-sizes',
  'package-history',
  'recent-searches',
])

const JAVASCRIPT_ANALYSIS_PROFILE = 'package-build-stats-v9'

const RESULT_SCHEMAS = Object.freeze({
  'package-analysis': 'javascript-package-analysis-v1',
  'package-exports': 'javascript-package-exports-v1',
  'package-export-sizes': 'javascript-package-export-sizes-v1',
  'package-history': 'javascript-package-history-v1',
  'recent-searches': 'javascript-recent-searches-v1',
})

function javascriptNamespace(env) {
  // These root names are existing production contracts. A future result schema
  // or analysis profile must use a new root rather than reinterpreting data in
  // one of these namespaces.
  const moduleReadRoot = env.FIREBASE_READ_KEY || 'modules-v3'
  const exportReadRoot = env.FIREBASE_READ_KEY_EXPORTS || 'exports-v3'
  const fallbackEnabled = !env.DISABLE_FIREBASE_V2_FALLBACK

  return {
    language: 'javascript',
    enabled: true,
    writesEnabled: true,
    analysisProfile: JAVASCRIPT_ANALYSIS_PROFILE,
    resultSchemas: RESULT_SCHEMAS,
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

function disabledNamespace(language) {
  const prefix = `${language}-v1`
  return {
    language,
    enabled: false,
    writesEnabled: false,
    analysisProfile: `${language}-disabled`,
    resultSchemas: Object.fromEntries(
      STORAGE_OPERATIONS.map(operation => [
        operation,
        `${language}-${operation}-v1`,
      ])
    ),
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

function getLanguageStorageNamespace(language, env = process.env) {
  switch (language) {
    case 'javascript':
      return javascriptNamespace(env)
    case 'java':
    case 'kotlin':
      return disabledNamespace(language)
    default:
      throw new Error(`Unknown storage language: ${language}`)
  }
}

function createStorageKey({
  language,
  operation,
  resultSchema,
  analysisProfile,
  identifier,
}) {
  return JSON.stringify([
    language,
    operation,
    resultSchema,
    analysisProfile,
    identifier,
  ])
}

function createNamespaceStorageKey(namespace, operation, identifier) {
  const resultSchema = namespace.resultSchemas[operation]
  if (!resultSchema) {
    throw new Error(
      `Missing ${namespace.language} result schema for ${operation}`
    )
  }
  return createStorageKey({
    language: namespace.language,
    operation,
    resultSchema,
    analysisProfile: namespace.analysisProfile,
    identifier,
  })
}

module.exports = {
  JAVASCRIPT_ANALYSIS_PROFILE,
  RESULT_SCHEMAS,
  STORAGE_OPERATIONS,
  createNamespaceStorageKey,
  createStorageKey,
  getLanguageStorageNamespace,
}
