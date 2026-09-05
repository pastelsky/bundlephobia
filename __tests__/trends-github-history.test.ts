jest.mock('../server/clients/github', () => ({
  fetchGithubRepository: jest.fn(),
  fetchGithubStarHistoryPage: jest.fn(),
}))
jest.mock('../server/trends/cache', () => ({
  getOrLoadTrendsData: (
    _cacheName: string,
    _cacheKey: string,
    _ttl: number,
    load: () => Promise<unknown>,
  ) => load(),
}))

import {
  fetchGithubRepository,
  fetchGithubStarHistoryPage,
} from '../server/clients/github'
import { fetchGithubTrendSeries } from '../server/trends/services/githubHistory'

const mockFetchGithubRepository = jest.mocked(fetchGithubRepository)
const mockFetchGithubStarHistoryPage = jest.mocked(fetchGithubStarHistoryPage)

describe('GitHub trends service', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'))
    jest.clearAllMocks()
    mockFetchGithubRepository.mockResolvedValue({
      full_name: 'example/project',
      stargazers_count: 100,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('maps official weekly star actions into daily points', async () => {
    mockFetchGithubStarHistoryPage.mockResolvedValue({
      lastPage: 1,
      rows: [
        {
          week: 1786233600,
          total: 7,
          days: [1, 0, 2, 0, 3, 1, 0],
        },
      ],
    })

    const result = await fetchGithubTrendSeries('example/project')

    expect(result.stars).toHaveLength(7)
    expect(result.stars.reduce((sum, point) => sum + point.value, 0)).toBe(7)
    expect(result.stars.every(point => point.partial === false)).toBe(true)
    expect(result.currentStars).toBe(100)
    expect(result.sources).toMatchObject({
      stars: 'github-star-history',
      historyComplete: true,
    })
  })

  it('paginates backward until the requested range is covered', async () => {
    mockFetchGithubStarHistoryPage
      .mockResolvedValueOnce({
        lastPage: 2,
        rows: [{ week: 1786406400, total: 1, days: [1, 0, 0, 0, 0, 0, 0] }],
      })
      .mockResolvedValueOnce({
        lastPage: 2,
        rows: [{ week: 1754265600, total: 2, days: [0, 0, 0, 0, 0, 2, 0] }],
      })

    await fetchGithubTrendSeries('example/project', 'last-year')

    expect(mockFetchGithubStarHistoryPage).toHaveBeenCalledTimes(2)
    expect(mockFetchGithubStarHistoryPage).toHaveBeenNthCalledWith(
      1,
      'example/project',
      1,
    )
    expect(mockFetchGithubStarHistoryPage).toHaveBeenNthCalledWith(
      2,
      'example/project',
      2,
    )
  })

  it('drops malformed rows instead of presenting unverified values', async () => {
    mockFetchGithubStarHistoryPage.mockResolvedValue({
      lastPage: 1,
      rows: [{ week: 1786406400, total: 99, days: [1, 0, 0, 0, 0, 0, 0] }],
    })

    const result = await fetchGithubTrendSeries('example/project')

    expect(result.stars).toEqual([])
    expect(result.sources.stars).toBe('unavailable')
  })

  it('rejects invalid repositories before calling upstream clients', async () => {
    await expect(
      fetchGithubTrendSeries("example/project' OR 1=1"),
    ).resolves.toMatchObject({
      stars: [],
      sources: { stars: 'unavailable' },
    })

    expect(mockFetchGithubRepository).not.toHaveBeenCalled()
    expect(mockFetchGithubStarHistoryPage).not.toHaveBeenCalled()
  })
})
