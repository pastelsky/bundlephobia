import {
  parseCacheKey,
  parseCacheRequestBody,
  parseExportsCacheResult,
  parsePackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

describe('cache contract', () => {
  it('accepts only the public cache key fields', () => {
    expect(parseCacheKey({ name: 'react', version: '18.3.1' })).toEqual({
      name: 'react',
      version: '18.3.1',
    })
    expect(
      parseCacheKey({
        name: 'react',
        version: '18.3.1',
        readKey: 'modules-v2',
      }),
    ).toBeNull()
  })

  it('validates package and exports results at the boundary', () => {
    expect(
      parsePackageCacheResult({
        name: 'react',
        version: '18.3.1',
        size: 100,
        gzip: 40,
        description: 'A library for user interfaces',
      }),
    ).not.toBeNull()
    expect(
      parsePackageCacheResult({
        name: 'react',
        version: '18.3.1',
        size: Number.NaN,
        gzip: 40,
      }),
    ).toBeNull()

    expect(
      parseExportsCacheResult({
        name: 'react',
        version: '18.3.1',
        assets: [{ name: 'index.js', gzip: 40, type: 'js' }],
      }),
    ).not.toBeNull()
    expect(
      parseExportsCacheResult({
        name: 'react',
        version: '18.3.1',
        assets: [{ name: 42 }],
      }),
    ).toBeNull()
  })

  it('does not allow a request to select an arbitrary Firebase root', () => {
    expect(
      parseCacheRequestBody({
        name: 'react',
        version: '18.3.1',
        readKey: 'modules-v2',
        result: { size: 100, gzip: 40 },
      }),
    ).toBeNull()
  })
})
