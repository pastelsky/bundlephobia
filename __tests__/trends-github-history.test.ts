jest.mock('../server/clients/clickHouse', () => ({
  fetchGithubRepositoryHistory: jest.fn(),
}))
jest.mock('../server/clients/github', () => ({
  fetchGithubRepository: jest.fn(),
}))
jest.mock('../server/clients/ossInsight', () => ({
  fetchOssInsightStarHistory: jest.fn(),
}))
jest.mock('../server/trends/cache', () => ({
  getOrLoadTrendsData: (
    _cacheName: string,
    _cacheKey: string,
    _ttl: number,
    load: () => Promise<unknown>
  ) => load(),
}))

import { fetchGithubRepositoryHistory } from '../server/clients/clickHouse'
import { fetchGithubRepository } from '../server/clients/github'
import { fetchOssInsightStarHistory } from '../server/clients/ossInsight'
import { fetchGithubTrendSeries } from '../server/trends/services/githubHistory'

const mockFetchGithubRepositoryHistory = jest.mocked(
  fetchGithubRepositoryHistory
)
const mockFetchGithubRepository = jest.mocked(fetchGithubRepository)
const mockFetchOssInsightStarHistory = jest.mocked(fetchOssInsightStarHistory)

describe('GitHub trends service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('keeps historical sources distinct from the current snapshot', async () => {
    mockFetchGithubRepositoryHistory.mockResolvedValue([
      {
        time: '2024-01-01T00:00:00Z',
        stargazers_count: 90,
        open_issues_count: 8,
      },
    ])
    mockFetchOssInsightStarHistory.mockResolvedValue([
      { date: '2024-02-01', stargazers: 95 },
    ])
    mockFetchGithubRepository.mockResolvedValue({
      full_name: 'example/project',
      stargazers_count: 100,
      open_issues_count: 10,
    })

    const result = await fetchGithubTrendSeries('example/project')

    expect(result.stars[0]).toEqual({ date: '2024-02-01', value: 95 })
    expect(result.issues[0]).toEqual({ date: '2024-01-01', value: 8 })
    expect(result.stars.at(-1)).toMatchObject({ value: 100, partial: true })
    expect(result.issues.at(-1)).toMatchObject({ value: 10, partial: true })
    expect(result.sources).toEqual({
      stars: 'ossinsight',
      issues: 'clickhouse',
      historyThrough: '2024-01-01',
    })
    expect(result).not.toHaveProperty('warning')
  })

  it('rejects invalid repositories before calling upstream clients', async () => {
    await expect(
      fetchGithubTrendSeries("example/project' OR 1=1")
    ).resolves.toMatchObject({
      stars: [],
      issues: [],
      sources: { stars: 'unavailable', issues: 'unavailable' },
    })

    expect(mockFetchGithubRepositoryHistory).not.toHaveBeenCalled()
    expect(mockFetchOssInsightStarHistory).not.toHaveBeenCalled()
    expect(mockFetchGithubRepository).not.toHaveBeenCalled()
  })
})
