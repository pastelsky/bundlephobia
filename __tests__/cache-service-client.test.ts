import CacheServiceClient from '../server/clients/cache-service.client'

const api = {
  get: jest.fn(),
  post: jest.fn(),
}

const key = { name: 'react', version: '18.3.1' }

describe('cache service client', () => {
  const client = new CacheServiceClient({ api })

  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('keeps hits, misses, backend failures, and invalid payloads distinct', async () => {
    api.get
      .mockResolvedValueOnce({
        data: { ...key, size: 100, gzip: 40 },
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404 },
      })
      .mockRejectedValueOnce(new Error('cache service unavailable'))
      .mockResolvedValueOnce({ data: { ...key, size: '100', gzip: 40 } })

    await expect(client.getPackageSize(key)).resolves.toMatchObject({
      status: 'hit',
      value: { size: 100, gzip: 40 },
    })
    await expect(client.getPackageSize(key)).resolves.toEqual({
      status: 'miss',
    })
    await expect(client.getPackageSize(key)).resolves.toMatchObject({
      status: 'unavailable',
      error: expect.any(Error),
    })
    await expect(client.getPackageSize(key)).resolves.toMatchObject({
      status: 'invalid',
      error: expect.any(Error),
    })
  })

  it('writes through the shared route and payload contract', async () => {
    api.post.mockResolvedValue({ status: 201 })

    await client.setPackageSize(key, { ...key, size: 100, gzip: 40 })

    expect(api.post).toHaveBeenCalledWith('/package-cache', {
      ...key,
      result: { ...key, size: 100, gzip: 40 },
    })
  })
})
