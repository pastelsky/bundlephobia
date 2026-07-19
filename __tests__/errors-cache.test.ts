import fetch from 'node-fetch'

import type { PackageBuildInfo } from '../types/package-domain'
import { createPackageApiPath } from '../utils/packageApi.utils'

const packageSizeUrl = (packageString: string) =>
  `http://127.0.0.1:5000${createPackageApiPath('size', packageString)}`

type PackageSizeResponse = PackageBuildInfo & {
  scoped: boolean
}

type ErrorResponse = {
  error: {
    code: string
    message: string
  }
}

jest.setTimeout(15000)

describe('build api', () => {
  it('builds correct packages', async () => {
    const resultURL = packageSizeUrl('react@16.5.0')
    const result = await fetch(resultURL)
    const resultJSON: PackageSizeResponse = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(resultJSON).toEqual({
      scoped: false,
      name: 'react',
      version: '16.5.0',
      description:
        'React is a JavaScript library for building user interfaces.',
      repository: 'https://github.com/facebook/react',
      dependencyCount: 4,
      hasJSNext: false,
      hasJSModule: false,
      hasSideEffects: true,
      size: 5951,
      gzip: 2528,
      dependencySizes: [{ name: 'react', approximateSize: 5957 }],
    })
  })

  it('handles hash bang in the beginning of packages', async () => {
    const resultURL = packageSizeUrl('@bundlephobia/test-build-error')
    const result = await fetch(resultURL)
    const resultJSON: PackageSizeResponse = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')
    expect(resultJSON.size).toBe(183)
    expect(resultJSON.gzip).toBe(153)
  })

  it('gives right error messages on when trying to build blocklisted packages', async () => {
    const resultURL = packageSizeUrl('polymer-cli')
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(403)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('BlocklistedPackageError')
    expect(errorJSON.error.message).toBe(
      'The package you were looking for is blocklisted ' +
        "because it failed to build multiple times in the past and further tries aren't likely to succeed. This can " +
        "happen if this package wasn't meant to be bundled in a client side application."
    )
  })

  it('gives right error messages on when trying to build entry point error ', async () => {
    const resultURL = packageSizeUrl('@bundlephobia/test-entry-point-error')
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(422)
    expect(result.headers.get('cache-control')).toBe('max-age=3600')
    expect(errorJSON.error.code).toBe('EntryPointError')
    expect(errorJSON.error.message).toBe(
      "We could not guess a valid entry point for this package. Perhaps the author hasn't specified one in its package.json ?"
    )
  })

  it('ignores errors when trying to build packages with missing dependency errors', async () => {
    const resultURL = packageSizeUrl('@bundlephobia/missing-dependency-error')
    const result = await fetch(resultURL)
    const resultJSON: PackageSizeResponse = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')
    expect(resultJSON.size).toBe(243)
    expect(resultJSON.gzip).toBe(178)
    expect(resultJSON.ignoredMissingDependencies).toStrictEqual([
      'missing-package',
    ])
  })

  it("gives right error messages on when trying to build packages that don't exist", async () => {
    const resultURL = packageSizeUrl('@bundlephobia/does-not-exist')
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('PackageNotFoundError')
    expect(errorJSON.error.message).toBe(
      "The package you were looking for doesn't exist."
    )
  })

  it("gives right error messages on when trying to build packages versions that don't exist", async () => {
    const resultURL = packageSizeUrl(
      '@bundlephobia/test-entry-point-error@459.0.0'
    )
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('PackageVersionMismatchError')
  })
})
