const fetch = require('node-fetch')

const baseURL = 'http://127.0.0.1:5000/api/size?package='

describe('build api', () => {
  beforeEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000
  })

  it('builds correct packages', async done => {
    const resultURL = baseURL + 'react@16.5.0'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(errorJSON).toEqual({
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

    done()
  })

  it('handles hash bang in the beginning of packages', async done => {
    const resultURL = baseURL + '@bundlephobia/test-build-error'
    const result = await fetch(resultURL)
    const resultJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(resultJSON.size).toBe(183)
    expect(resultJSON.gzip).toBe(153)

    done()
  })

  it('gives right error messages on when trying to build blacklisted packages', async done => {
    const resultURL = baseURL + 'polymer-cli'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(403)
    expect(result.headers.get('cache-control')).toBe('max-age=60')

    expect(errorJSON.error.code).toBe('BlacklistedPackageError')
    expect(errorJSON.error.message).toBe(
      'The package you were looking for is blacklisted due to suspicious activity in the past'
    )

    done()
  })

  it('gives right error messages on when trying to build entry point error ', async done => {
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(500)
    expect(result.headers.get('cache-control')).toBe('max-age=3600')

    expect(errorJSON.error.code).toBe('EntryPointError')
    expect(errorJSON.error.message).toBe(
      "We could not guess a valid entry point for this package. Perhaps the author hasn't specified one in its package.json ?"
    )

    done()
  })

  it('ignores errors when trying to build packages with missing dependency errors', async done => {
    const resultURL = baseURL + '@bundlephobia/missing-dependency-error'
    const result = await fetch(resultURL)
    const resultJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(resultJSON.size).toBe(243)
    expect(resultJSON.gzip).toBe(178)
    expect(resultJSON.ignoredMissingDependencies).toStrictEqual([
      'missing-package',
    ])
    done()
  })

  it("gives right error messages on when trying to build packages that don't exist", async done => {
    const resultURL = baseURL + '@bundlephobia/does-not-exist'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')

    expect(errorJSON.error.code).toBe('PackageNotFoundError')
    expect(errorJSON.error.message).toBe(
      "The package you were looking for doesn't exist."
    )

    done()
  })

  it("gives right error messages on when trying to build packages versions that don't exist", async done => {
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error@459.0.0'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('PackageVersionMismatchError')

    done()
  })
})
