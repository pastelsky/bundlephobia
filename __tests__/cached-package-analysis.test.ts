import axios from 'axios'

import { getCachedPackageAnalysis } from '../server/seo/cachedPackageAnalysis'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}))

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>

describe('getCachedPackageAnalysis', () => {
  const originalPort = process.env.PORT

  afterEach(() => {
    jest.resetAllMocks()
    if (originalPort === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = originalPort
    }
  })

  it('uses the existing size API without recording or building on a miss', async () => {
    const result = { name: 'react', version: '18.2.0' }
    process.env.PORT = '4321'
    mockedGet.mockResolvedValue({ status: 200, data: result } as never)

    await expect(getCachedPackageAnalysis('react@18.2.0')).resolves.toBe(result)
    expect(mockedGet).toHaveBeenCalledWith(
      '/api/size',
      expect.objectContaining({
        baseURL: 'http://127.0.0.1:4321',
        timeout: 6000,
        params: {
          package: 'react@18.2.0',
          peep: 'true',
        },
      })
    )
    expect(mockedGet.mock.calls[0][1]?.params).not.toHaveProperty('record')
    expect(mockedGet.mock.calls[0][1]?.params).not.toHaveProperty('force')
  })

  it('returns null when the shared API reports a cache miss', async () => {
    mockedGet.mockResolvedValue({ status: 404, data: null } as never)

    await expect(getCachedPackageAnalysis('uncached')).resolves.toBeNull()
  })
})
