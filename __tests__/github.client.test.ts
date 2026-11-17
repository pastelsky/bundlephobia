import {
  fetchGithubStarCount,
  fetchGithubStarHistoryPage,
  getGithubRequestHeaders,
} from '../server/clients/github.client'

describe('github client auth headers', () => {
  it('sets Basic Auth header when GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are provided', () => {
    const headers = getGithubRequestHeaders({
      GITHUB_CLIENT_ID: 'test-id',
      GITHUB_CLIENT_SECRET: 'test-secret',
    })

    const expectedCredentials = Buffer.from('test-id:test-secret').toString(
      'base64',
    )

    expect(headers).toEqual({
      'User-Agent': 'bundlephobia-trends',
      Authorization: `Basic ${expectedCredentials}`,
    })
  })

  it('prefers GITHUB_TOKEN Bearer auth when token is present', () => {
    const headers = getGithubRequestHeaders({
      GITHUB_TOKEN: 'test-token',
      GITHUB_CLIENT_ID: 'test-id',
      GITHUB_CLIENT_SECRET: 'test-secret',
    })

    expect(headers).toEqual({
      'User-Agent': 'bundlephobia-trends',
      Authorization: 'Bearer test-token',
    })
  })

  it('fetches star count using provided http client', async () => {
    const mockHttpClient = {
      get: jest.fn().mockResolvedValue({
        data: { count: 123 },
        headers: {},
      }),
    }

    const count = await fetchGithubStarCount('facebook/react', mockHttpClient)
    expect(count).toBe(123)
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      '/repos/facebook/react/stargazers/count',
      expect.objectContaining({
        maxRedirects: 5,
      }),
    )
  })

  it('parses history page with lastPage from Link header', async () => {
    const mockHttpClient = {
      get: jest.fn().mockResolvedValue({
        data: [{ week: 1700000000, total: 10, days: [1, 2, 0, 0, 1, 1, 5] }],
        headers: {
          link: '<https://api.github.com/repositories/123/stargazers/history?page=2>; rel="next", <https://api.github.com/repositories/123/stargazers/history?page=15>; rel="last"',
        },
      }),
    }

    const result = await fetchGithubStarHistoryPage(
      'facebook/react',
      1,
      mockHttpClient,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.lastPage).toBe(15)
  })
})
