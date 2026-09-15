import {
  formatJavaScriptPackageSpecifier,
  parseJavaScriptPackageSpecifier,
} from '../languages/javascript'
import {
  getExplicitPackagePagePath,
  getPackagePagePath,
  parsePackagePageRoute,
} from '../languages/package-route'
import {
  LANGUAGE_DESCRIPTORS,
  createLanguageRegistry,
  languageRegistry,
} from '../languages/registry'
import type {
  LanguageDescriptor,
  PackageReport,
} from '../types/language-domain'

describe('package report model', () => {
  it('keeps JavaScript analysis typed behind the language discriminant', () => {
    const report: PackageReport = {
      schemaVersion: 1,
      language: 'javascript',
      identity: {
        language: 'javascript',
        specifier: 'react',
        name: 'react',
        version: '19.2.0',
        displayName: 'react',
        canonicalSpecifier: 'react@19.2.0',
      },
      status: 'complete',
      diagnostics: [],
      analysis: {
        size: 7_500,
        gzip: 2_900,
        dependencyCount: 0,
        hasSideEffects: true,
        hasJSModule: false,
        hasJSNext: false,
        isModuleType: false,
      },
    }

    expect(report.language).toBe('javascript')
    expect(report.analysis.gzip).toBe(2_900)
  })
})

describe('JavaScript package specifier adapter', () => {
  it.each([
    {
      specifier: 'react',
      name: 'react',
      version: null,
      scope: undefined,
      scoped: false,
    },
    {
      specifier: 'react@19.2.0',
      name: 'react',
      version: '19.2.0',
      scope: undefined,
      scoped: false,
    },
    {
      specifier: '@babel/core',
      name: '@babel/core',
      version: null,
      scope: 'babel',
      scoped: true,
    },
    {
      specifier: '@babel/core@9.8.0',
      name: '@babel/core',
      version: '9.8.0',
      scope: 'babel',
      scoped: true,
    },
    {
      specifier: 'chart.js@0.7.0-beta',
      name: 'chart.js',
      version: '0.7.0-beta',
      scope: undefined,
      scoped: false,
    },
  ])(
    'parses and formats $specifier',
    ({ specifier, name, version, scope, scoped }) => {
      const parsed = parseJavaScriptPackageSpecifier(specifier)

      expect(parsed).toEqual({ name, version, scope, scoped })
      expect(formatJavaScriptPackageSpecifier(parsed)).toBe(specifier)
    },
  )
})

describe('language registry', () => {
  it('registers only JavaScript as enabled and visible', () => {
    expect(languageRegistry.enabled().map(language => language.id)).toEqual([
      'javascript',
    ])
    expect(languageRegistry.visible().map(language => language.id)).toEqual([
      'javascript',
    ])
  })

  it.each(['java', 'kotlin'] as const)(
    'keeps %s disabled, hidden, and without capabilities',
    languageId => {
      expect(languageRegistry.get(languageId)).toMatchObject({
        state: 'disabled',
        visibility: 'hidden',
        capabilities: [],
      })
    },
  )

  it('rejects duplicate descriptors', () => {
    expect(() =>
      createLanguageRegistry([
        ...LANGUAGE_DESCRIPTORS,
        LANGUAGE_DESCRIPTORS[0],
      ]),
    ).toThrow('Duplicate language descriptor: javascript')
  })

  it('rejects an incomplete registry', () => {
    const javascriptOnly: readonly LanguageDescriptor[] = [
      LANGUAGE_DESCRIPTORS[0],
    ]

    expect(() => createLanguageRegistry(javascriptOnly)).toThrow(
      'Missing language descriptors: java, kotlin',
    )
  })
})

describe('package page routes', () => {
  it('parses legacy unscoped and scoped JavaScript routes', () => {
    expect(parsePackagePageRoute('react@19.2.0')).toEqual({
      kind: 'legacy-javascript',
      reference: { language: 'javascript', specifier: 'react@19.2.0' },
    })
    expect(parsePackagePageRoute(['@babel', 'core@9.8.0'])).toEqual({
      kind: 'legacy-javascript',
      reference: {
        language: 'javascript',
        specifier: '@babel/core@9.8.0',
      },
    })
  })

  it.each([
    ['javascript', 'react@19.2.0'],
    ['java', 'com.google.code.gson:gson:2.14.0'],
    ['kotlin', 'org.jetbrains.kotlin:kotlin-stdlib:2.4.10'],
  ] as const)('parses an explicit %s route', (language, specifier) => {
    expect(parsePackagePageRoute([language, specifier])).toEqual({
      kind: 'language-explicit',
      reference: { language, specifier },
    })
  })

  it('continues generating legacy JavaScript paths', () => {
    expect(
      getPackagePagePath({
        language: 'javascript',
        specifier: '@babel/core@9.8.0',
      }),
    ).toBe('/package/@babel/core@9.8.0')
  })

  it('generates explicit paths for other languages and on request', () => {
    expect(
      getPackagePagePath({
        language: 'java',
        specifier: 'com.google.code.gson:gson:2.14.0',
      }),
    ).toBe('/package/java/com.google.code.gson:gson:2.14.0')
    expect(getExplicitPackagePagePath('javascript', 'react@19.2.0')).toBe(
      '/package/javascript/react@19.2.0',
    )
  })

  it('returns null for a missing route value', () => {
    expect(parsePackagePageRoute(undefined)).toBeNull()
    expect(parsePackagePageRoute([])).toBeNull()
  })
})
