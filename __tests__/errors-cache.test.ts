import fetch from 'node-fetch'

const baseURL = 'http://127.0.0.1:5000/api/size?package='

type PackageSizeResponse = {
  scoped: boolean
  name: string
  version: string
  description: string
  repository: string
  dependencyCount: number
  hasJSNext: boolean
  hasJSModule: boolean
  hasSideEffects: boolean
  size: number
  gzip: number
  dependencySizes: Array<{ name: string; approximateSize: number }>
  ignoredMissingDependencies?: string[]
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
    const resultURL = baseURL + 'react@16.5.0'
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
    const resultURL = baseURL + '@bundlephobia/test-build-error'
    const result = await fetch(resultURL)
    const resultJSON: PackageSizeResponse = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')
    expect(resultJSON.size).toBe(183)
    expect(resultJSON.gzip).toBe(153)
  })

  it('gives right error messages on when trying to build blocklisted packages', async () => {
    const resultURL = baseURL + 'polymer-cli'
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(403)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('BlocklistedPackageError')
    expect(errorJSON.error.message).toBe(
      'The package you were looking for is blocklisted due to suspicious activity in the past'
    )
  })

  it('gives right error messages on when trying to build entry point error ', async () => {
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error'
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(500)
    expect(result.headers.get('cache-control')).toBe('max-age=3600')
    expect(errorJSON.error.code).toBe('EntryPointError')
    expect(errorJSON.error.message).toBe(
      "We could not guess a valid entry point for this package. Perhaps the author hasn't specified one in its package.json ?"
    )
  })

  it('ignores errors when trying to build packages with missing dependency errors', async () => {
    const resultURL = baseURL + '@bundlephobia/missing-dependency-error'
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
    const resultURL = baseURL + '@bundlephobia/does-not-exist'
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
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error@459.0.0'
    const result = await fetch(resultURL)
    const errorJSON: ErrorResponse = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('PackageVersionMismatchError')
  })
})
