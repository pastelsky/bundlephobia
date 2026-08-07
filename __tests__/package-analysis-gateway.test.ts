import type { PackageReference } from '../types/language-domain'
import { createAnalysisContextMiddleware } from '../server/analysis/context.middleware'
import { PackageAnalysisGateway } from '../server/analysis/PackageAnalysisGateway'
import type { PackageAnalysisAdapter } from '../server/analysis/contracts'
import { PackageAnalysisGatewayError } from '../server/analysis/errors'
import { createAnalysisKey } from '../server/analysis/keys'
import { toLegacyJavaScriptError } from '../server/analysis/javascript/legacyErrorMapper'
import CustomError from '../server/CustomError'

function createJavaScriptAdapter(): PackageAnalysisAdapter<'javascript'> {
  return {
    language: 'javascript',
    resolvePackage: jest.fn(async reference => ({
      language: 'javascript',
      specifier: reference.specifier,
      name: 'example',
      version: '1.0.0',
      displayName: 'example',
      canonicalSpecifier: 'example@1.0.0',
      description: '',
      repository: '',
    })),
    isExactVersionSpecifier: jest.fn(() => true),
    analyzePackage: jest.fn(async () => ({ size: 1, gzip: 1 } as never)),
    analyzePackageExports: jest.fn(async () => [] as never),
    analyzePackageExportSizes: jest.fn(async () => ({} as never)),
  }
}

describe('PackageAnalysisGateway', () => {
  it('carries the route language into reusable analysis middleware', async () => {
    const ctx = { state: {} }
    const next = jest.fn()

    await createAnalysisContextMiddleware('package-analysis', 'kotlin')(
      ctx as never,
      next
    )

    expect(ctx.state).toEqual({
      analysis: { language: 'kotlin', operation: 'package-analysis' },
    })
    expect(next).toHaveBeenCalled()
  })

  it('routes enabled JavaScript requests through its registered adapter', async () => {
    const gateway = new PackageAnalysisGateway()
    const adapter = createJavaScriptAdapter()
    gateway.register(adapter)
    const reference: PackageReference<'javascript'> = {
      language: 'javascript',
      specifier: 'example@latest',
    }

    await expect(gateway.resolvePackage(reference)).resolves.toMatchObject({
      language: 'javascript',
      canonicalSpecifier: 'example@1.0.0',
    })
    expect(adapter.resolvePackage).toHaveBeenCalledWith(reference)
  })

  it('routes each analysis capability without changing adapter results', async () => {
    const gateway = new PackageAnalysisGateway()
    const adapter = createJavaScriptAdapter()
    gateway.register(adapter)
    const resolved = {
      language: 'javascript' as const,
      specifier: 'example@1.0.0',
      name: 'example',
      version: '1.0.0',
      displayName: 'example',
      canonicalSpecifier: 'example@1.0.0',
      description: '',
      repository: '',
    }
    const options = { priority: 20 }

    await gateway.analyzePackage(resolved, options)
    await gateway.analyzePackageExports(resolved, options)
    await gateway.analyzePackageExportSizes(resolved, options)

    expect(adapter.analyzePackage).toHaveBeenCalledWith(resolved, options)
    expect(adapter.analyzePackageExports).toHaveBeenCalledWith(
      resolved,
      options
    )
    expect(adapter.analyzePackageExportSizes).toHaveBeenCalledWith(
      resolved,
      options
    )
  })

  it.each(['java', 'kotlin'] as const)(
    'rejects disabled %s requests before adapter lookup',
    async language => {
      const gateway = new PackageAnalysisGateway()

      await expect(
        gateway.resolvePackage({ language, specifier: 'example' })
      ).rejects.toMatchObject({
        code: 'LanguageNotEnabled',
        language,
      })
    }
  )

  it('rejects duplicate adapters', () => {
    const gateway = new PackageAnalysisGateway()
    gateway.register(createJavaScriptAdapter())
    expect(() => gateway.register(createJavaScriptAdapter())).toThrow(
      'Duplicate package analysis adapter: javascript'
    )
  })

  it('reports a missing capability implementation as a gateway error', () => {
    const gateway = new PackageAnalysisGateway()
    const adapter = createJavaScriptAdapter()
    delete adapter.analyzePackageExports
    gateway.register(adapter)

    expect(() =>
      gateway.analyzePackageExports(
        {
          language: 'javascript',
          specifier: 'example@1.0.0',
          name: 'example',
          version: '1.0.0',
          displayName: 'example',
          canonicalSpecifier: 'example@1.0.0',
          description: '',
          repository: '',
        },
        { priority: 5 }
      )
    ).toThrow(PackageAnalysisGatewayError)
  })
})

describe('analysis identities', () => {
  it('cannot collide across languages or operations', () => {
    const packageSpecifier = '@scope/example@1.0.0'
    const keys = [
      createAnalysisKey({
        language: 'javascript',
        operation: 'package-analysis',
        packageSpecifier,
      }),
      createAnalysisKey({
        language: 'javascript',
        operation: 'package-exports',
        packageSpecifier,
      }),
      createAnalysisKey({
        language: 'java',
        operation: 'package-analysis',
        packageSpecifier,
      }),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('legacy JavaScript error mapping', () => {
  it('preserves existing JavaScript errors by identity', () => {
    const legacyError = new CustomError('EntryPointError', 'missing', undefined)
    expect(toLegacyJavaScriptError(legacyError)).toBe(legacyError)
  })

  it('maps gateway-native errors to the existing legacy error vocabulary', () => {
    const error = new PackageAnalysisGatewayError(
      'LanguageCapabilityNotSupported',
      'javascript',
      'exports'
    )

    expect(toLegacyJavaScriptError(error)).toMatchObject({
      name: 'UnsupportedPackageError',
      extra: { reason: 'exports is not supported for javascript' },
    })
  })
})
