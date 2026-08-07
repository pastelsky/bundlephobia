jest.mock('axios', () => ({
  __esModule: true,
  cacheApi: { get: jest.fn(), post: jest.fn() },
  default: {
    create: jest.fn(() => jest.requireMock('axios').cacheApi),
    isAxiosError: jest.fn(() => false),
  },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}))

import Cache from '../utils/cache.utils'

const { get: cacheGet, post: cachePost } = jest.requireMock('axios').cacheApi

describe('language-aware cache client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('preserves the exact JavaScript cache-service wire contract', async () => {
    cacheGet.mockResolvedValue({ data: { size: 123 } })
    cachePost.mockResolvedValue(undefined)
    const cache = new Cache()
    const key = {
      language: 'javascript' as const,
      name: '@scope/example',
      version: '1.0.0',
    }

    await expect(cache.getPackageSize(key)).resolves.toEqual({ size: 123 })
    await cache.setPackageSize(key, { size: 123 })
    await expect(cache.getExportsSize(key)).resolves.toEqual({ size: 123 })
    await cache.setExportsSize(key, { assets: [] })

    expect(cacheGet).toHaveBeenCalledWith('/package-cache', {
      params: { name: '@scope/example', version: '1.0.0' },
    })
    expect(cachePost).toHaveBeenCalledWith('/package-cache', {
      name: '@scope/example',
      version: '1.0.0',
      result: { size: 123 },
    })
    expect(cacheGet).toHaveBeenCalledWith('/exports-cache', {
      params: { name: '@scope/example', version: '1.0.0' },
    })
    expect(cachePost).toHaveBeenCalledWith('/exports-cache', {
      name: '@scope/example',
      version: '1.0.0',
      result: { assets: [] },
    })
  })

  it.each(['java', 'kotlin'] as const)(
    'does not read or write cache-service data for disabled %s',
    async language => {
      const cache = new Cache()
      const key = { language, name: 'example', version: '1.0.0' }

      await expect(cache.getPackageSize(key)).resolves.toBeUndefined()
      await cache.setPackageSize(key, { size: 123 })
      await expect(cache.getExportsSize(key)).resolves.toBeUndefined()
      await cache.setExportsSize(key, { exports: [] })

      expect(cacheGet).not.toHaveBeenCalled()
      expect(cachePost).not.toHaveBeenCalled()
    }
  )
})
