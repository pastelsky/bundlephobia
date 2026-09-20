const pacote = require('pacote')

import {
  fetchPackageHistory,
  type PackageHistoryOptions,
} from '../server/services/package-history.service'
import firebaseUtils from '../utils/firebase.utils'

const mockFetchPackagePackument = jest.spyOn(pacote, 'packument')

const mockGetPackageHistory = jest.spyOn(firebaseUtils, 'getPackageHistory')

function getHistory(options: PackageHistoryOptions) {
  return fetchPackageHistory('example', options)
}

describe('package history', () => {
  beforeEach(() => {
    mockFetchPackagePackument.mockReset()
    mockGetPackageHistory.mockReset()
  })

  it('joins cached build sizes with NPM dates and release markers', async () => {
    mockFetchPackagePackument.mockResolvedValue({
      'dist-tags': { latest: '2.1.0' },
      repository: 'https://github.com/example/project.git',
      time: {
        created: '2024-01-01T00:00:00.000Z',
        '1.0.0': '2024-01-02T00:00:00.000Z',
        '2.0.0': '2024-02-02T00:00:00.000Z',
        '2.1.0': '2024-03-02T00:00:00.000Z',
        '2.1.1': '2024-03-03T00:00:00.000Z',
        '3.0.0-beta.1': '2024-04-02T00:00:00.000Z',
      },
    })
    mockGetPackageHistory.mockResolvedValue({
      '2.0.0': { size: 200, gzip: 80 },
      '2.1.0': { size: 210, gzip: 85 },
    })

    await expect(
      getHistory({
        from: '2024-01-01',
        to: '2024-03-02',
        limit: 40,
      }),
    ).resolves.toEqual({
      name: 'example',
      repository: 'example/project',
      versions: [
        {
          version: '2.0.0',
          publishedAt: '2024-02-02',
          size: 200,
          gzip: 80,
          built: true,
        },
        {
          version: '2.1.0',
          publishedAt: '2024-03-02',
          size: 210,
          gzip: 85,
          built: true,
        },
      ],
      releases: [
        {
          version: '1.0.0',
          publishedAt: '2024-01-02',
          major: true,
          minor: false,
        },
        {
          version: '2.0.0',
          publishedAt: '2024-02-02',
          major: true,
          minor: false,
        },
        {
          version: '2.1.0',
          publishedAt: '2024-03-02',
          major: false,
          minor: true,
        },
      ],
      range: { from: '2024-01-01', to: '2024-03-02' },
    })
    expect(mockGetPackageHistory).toHaveBeenCalledWith(
      'example',
      40,
      expect.any(Function),
    )

    const includeVersion = mockGetPackageHistory.mock.calls[0][2]
    expect(includeVersion?.('1.0.0')).toBe(true)
    expect(includeVersion?.('2.1.1')).toBe(false)
  })

  it('returns placeholders for versions without a cached build', async () => {
    mockFetchPackagePackument.mockResolvedValue({
      time: { '1.0.0': '2024-01-02T00:00:00.000Z' },
    })
    mockGetPackageHistory.mockResolvedValue({ '1.0.0': {} })

    await expect(getHistory({ limit: 40 })).resolves.toMatchObject({
      versions: [
        {
          version: '1.0.0',
          publishedAt: '2024-01-02',
          size: null,
          gzip: null,
          built: false,
        },
      ],
    })
  })
})
