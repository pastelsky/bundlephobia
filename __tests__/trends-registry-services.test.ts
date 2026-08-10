jest.mock('../server/clients/npmRegistry', () => ({
  fetchPackagePackument: jest.fn(),
}))
jest.mock('../server/trends/cache', () => ({
  getOrLoadTrendsData: (
    _cacheName: string,
    _cacheKey: string,
    _ttl: number,
    load: () => Promise<unknown>
  ) => load(),
}))

import { fetchPackagePackument } from '../server/clients/npmRegistry'
import { fetchPackageReleases } from '../server/trends/services/releases'
import { resolveGithubRepo } from '../server/trends/services/resolveGithubRepo'

const mockFetchPackagePackument = jest.mocked(fetchPackagePackument)

describe('trends npm registry services', () => {
  beforeEach(() => {
    mockFetchPackagePackument.mockReset()
  })

  it('derives stable major and minor releases from a Pacote packument', async () => {
    mockFetchPackagePackument.mockResolvedValue({
      time: {
        created: '2024-01-01T00:00:00.000Z',
        '1.0.0': '2024-01-02T00:00:00.000Z',
        '1.1.0': '2024-02-02T00:00:00.000Z',
        '1.1.1': '2024-02-03T00:00:00.000Z',
        '2.0.0-beta.1': '2024-03-01T00:00:00.000Z',
      },
    })

    await expect(fetchPackageReleases('example')).resolves.toEqual({
      releases: [
        {
          version: '1.0.0',
          date: '2024-01-02',
          major: true,
          minor: false,
        },
        {
          version: '1.1.0',
          date: '2024-02-02',
          major: false,
          minor: true,
        },
      ],
      publishDates: {
        '1.0.0': '2024-01-02',
        '1.1.0': '2024-02-02',
        '1.1.1': '2024-02-03',
      },
    })
    expect(mockFetchPackagePackument).toHaveBeenCalledWith('example')
  })

  it('resolves repository metadata from the same Pacote packument', async () => {
    mockFetchPackagePackument.mockResolvedValue({
      'dist-tags': { latest: '2.0.0' },
      versions: {
        '2.0.0': {
          name: 'example',
          version: '2.0.0',
          repository: 'git+https://github.com/example/project.git',
        },
      },
    })

    await expect(resolveGithubRepo('example')).resolves.toBe('example/project')
    expect(mockFetchPackagePackument).toHaveBeenCalledWith('example')
  })
})
