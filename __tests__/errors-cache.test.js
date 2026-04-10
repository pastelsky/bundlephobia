const fetch = require('node-fetch')

const baseURL = 'http://127.0.0.1:5000/api/size?package='

describe('build api', () => {
  beforeEach(function () {
    jest.setTimeout(15000)
  })

  it('builds correct packages', async () => {
    const resultURL = baseURL + 'react@16.5.0'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(errorJSON.name).toBe('react')
    expect(errorJSON.version).toBe('16.5.0')
  })

  it('handles hash bang in the beginning of packages', async () => {
    const resultURL = baseURL + '@bundlephobia/test-build-error'
    const result = await fetch(resultURL)
    const resultJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(resultJSON.size).toBeGreaterThan(0)
  })

  it('gives right error messages on when trying to build blocklisted packages', async () => {
    const resultURL = baseURL + 'polymer-cli'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(403)
    expect(result.headers.get('cache-control')).toBe('max-age=60')

    expect(errorJSON.error.code).toBe('BlocklistedPackageError')
  })

  it('gives right error messages on when trying to build entry point error ', async () => {
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(500)
    expect(result.headers.get('cache-control')).toBe('max-age=3600')

    expect(errorJSON.error.code).toBe('EntryPointError')
  })

  it('ignores errors when trying to build packages with missing dependency errors', async () => {
    const resultURL = baseURL + '@bundlephobia/missing-dependency-error'
    const result = await fetch(resultURL)
    const resultJSON = await result.json()

    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('max-age=86400')

    expect(resultJSON.size).toBeGreaterThan(0)
  })

  it("gives right error messages on when trying to build packages that don't exist", async () => {
    const resultURL = baseURL + '@bundlephobia/does-not-exist'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')

    expect(errorJSON.error.code).toBe('PackageNotFoundError')
  })

  it("gives right error messages on when trying to build packages versions that don't exist", async () => {
    const resultURL = baseURL + '@bundlephobia/test-entry-point-error@459.0.0'
    const result = await fetch(resultURL)
    const errorJSON = await result.json()

    expect(result.status).toBe(404)
    expect(result.headers.get('cache-control')).toBe('max-age=60')
    expect(errorJSON.error.code).toBe('PackageVersionMismatchError')
  })
})
