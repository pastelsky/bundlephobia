import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'

import CacheServiceClient from '../server/clients/cache-service.client'
import { createCachedAnalysisMiddleware } from '../server/middlewares/cached-analysis.middleware'
import buildMissRateLimit from '../server/middlewares/build-miss-rate-limit.middleware'
import { createCachedAnalysisReader } from '../server/services/cached-analysis.service'
import { latestBuiltVersion } from '../cache-service/cache.utils.ts'

const result = {
  name: 'cached-library',
  version: '1.2.3',
  size: 100,
  gzip: 40,
  description: 'Cached package facts',
  repository: '',
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: false,
  hasJSNext: false,
  isModuleType: false,
}

const cache = new CacheServiceClient()

const build = jest.fn()

let server: Server

let baseURL: string

let clientNumber = 10

beforeAll(async () => {
  const app = new Koa()
  app.use(async (ctx, next) => {
    const operation = ctx.path.endsWith('exports-sizes')
      ? 'exports-sizes'
      : ctx.path.endsWith('exports')
        ? 'exports'
        : 'size'

    await createCachedAnalysisMiddleware(operation, cache)(ctx, next)
  })
  // Model the ordinary visitor route's cache-hit / build-miss boundary.
  app.use(async (ctx, next) => {
    const cached = await cache.getPackageSize({
      name: result.name,
      version: result.version,
    })

    if (cached.status === 'hit' && !ctx.query.force) {
      ctx.body = cached.value

      return
    }

    await next()
  })
  app.use(buildMissRateLimit({ maxRequests: 1, whiteList: [] }))
  app.use(ctx => {
    build()
    ctx.body = { built: true }
  })
  server = createServer(app.callback())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  // SAFETY: listen above explicitly binds an IPv4 port, not a Unix socket.
  const address = server.address() as AddressInfo
  baseURL = `http://127.0.0.1:${address.port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
  clientNumber += 1
  jest.restoreAllMocks()
  build.mockClear()
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'hit', value: result })
  jest.spyOn(CacheServiceClient.prototype, 'getExportsSize').mockResolvedValue({
    status: 'hit',
    value: { name: result.name, version: result.version, assets: [] },
  })
})

function request(
  path: string,
  userAgent = 'Googlebot',
  headers: Record<string, string> = {},
) {
  return fetch(`${baseURL}${path}`, {
    headers: {
      'User-Agent': userAgent,
      'CF-Connecting-IP': `192.0.2.${clientNumber}`,
      ...headers,
    },
  })
}

it.each(['size', 'exports-sizes'])(
  'serves cached %s to crawlers even with force and an exhausted build budget',
  async operation => {
    const response = await request(
      `/api/${operation}?package=cached-library@1.2.3&force=true`,
      'Googlebot',
      { 'X-Bundlephobia-Build-Budget-Exceeded': 'true' },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      name: result.name,
      version: result.version,
    })
    expect(build).not.toHaveBeenCalled()
  },
)

const failedStatuses: Array<'unavailable' | 'invalid'> = [
  'unavailable',
  'invalid',
]

it.each(failedStatuses)(
  'does not build or report a nonexistent package when the crawler cache is %s',
  async status => {
    jest
      .spyOn(CacheServiceClient.prototype, 'getPackageSize')
      .mockResolvedValue({
        status,
        error: new Error('cache failure'),
      })

    const response = await request(
      '/api/size?package=cached-library@1.2.3&force=true',
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(build).not.toHaveBeenCalled()
  },
)

it('keeps explicit cache-only export discovery read-only', async () => {
  expect(
    (await request('/api/exports?package=cached-library@1.2.3&peep=true'))
      .status,
  ).toBe(503)
  expect(build).not.toHaveBeenCalled()
})

it('allows visitor cache hits after the work budget is exhausted, but blocks misses', async () => {
  const headers = { 'X-Bundlephobia-Build-Budget-Exceeded': 'true' }
  expect(
    (
      await request(
        '/api/size?package=cached-library@1.2.3',
        'Mozilla/5.0',
        headers,
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await request(
        '/api/size?package=cached-library@1.2.3&force=true',
        'Mozilla/5.0',
        headers,
      )
    ).status,
  ).toBe(429)
  expect(build).not.toHaveBeenCalled()
})

it('still admits a visitor build and rate-limits subsequent misses', async () => {
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'miss' })
  expect(
    (await request('/api/size?package=cached-library@1.2.3', 'Mozilla/5.0'))
      .status,
  ).toBe(200)
  expect(
    (await request('/api/size?package=cached-library@1.2.3', 'Mozilla/5.0'))
      .status,
  ).toBe(429)
  expect(build).toHaveBeenCalledTimes(1)
})

it('returns older built releases only to crawlers and honors explicit versions', async () => {
  const registry = {
    fetchPackageManifest: jest.fn(),
    fetchPackageVersionManifest: jest
      .fn()
      .mockResolvedValue({ name: result.name, version: '2.0.0' }),
  }

  const client = {
    getPackageSize: jest.fn(
      async ({ version }: { name: string; version: string }) => ({
        status: 'hit' as const,
        value: {
          ...result,
          version: version === 'latest-built' ? result.version : version,
        },
      }),
    ),
    getExportsSize: cache.getExportsSize.bind(cache),
  }

  const { readPackage } = createCachedAnalysisReader(client, registry)
  await expect(readPackage('cached-library@1.2.3')).resolves.toEqual(result)
  expect(registry.fetchPackageVersionManifest).not.toHaveBeenCalled()

  const results = await Promise.all([
    readPackage('cached-library', true),
    readPackage('cached-library@latest', true),
  ])

  expect(results).toEqual([result, result])
  expect(registry.fetchPackageVersionManifest).not.toHaveBeenCalled()
  await expect(readPackage('cached-library')).resolves.toMatchObject({
    version: '2.0.0',
  })
  await expect(
    readPackage('cached-library@2.0.0', true),
  ).resolves.toMatchObject({ version: '2.0.0' })
  expect(registry.fetchPackageVersionManifest).toHaveBeenCalledTimes(1)
  registry.fetchPackageVersionManifest.mockResolvedValue({
    name: result.name,
    version: '3.0.0',
  })
  await expect(readPackage('cached-library')).resolves.toMatchObject({
    version: '3.0.0',
  })
  expect(registry.fetchPackageVersionManifest).toHaveBeenCalledTimes(2)
})

it('serves an older built release to an unversioned crawler request without allowing shared response caching', async () => {
  const response = await request('/api/size?package=cached-library')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ version: result.version })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(build).not.toHaveBeenCalled()
})

it('allows a first crawler build, ignores force, and returns 429 once its allowance is exhausted', async () => {
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'miss' })
  const path = '/api/size?package=cached-library@1.2.3&force=true'
  expect((await request(path)).status).toBe(200)
  expect((await request(path)).status).toBe(429)
  expect(build).toHaveBeenCalledTimes(1)
})

it('selects the newest stable cached version semantically, not lexicographically or by write order', () => {
  expect(
    latestBuiltVersion({
      '9,0,0': {},
      '20,0,0-beta,1': {},
      '10,0,0': {},
      '2,0,0': {},
    }),
  ).toBe('10.0.0')
  expect(latestBuiltVersion({ '20,0,0-beta,1': {} })).toBeNull()
})

it('keeps one visitor’s exhausted build allowance separate from another visitor', async () => {
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'miss' })
  const path = '/api/size?package=cached-library@1.2.3'
  const first = { 'CF-Connecting-IP': '192.0.2.1' }
  const second = { 'CF-Connecting-IP': '192.0.2.2' }
  expect((await request(path, 'Mozilla/5.0', first)).status).toBe(200)
  expect((await request(path, 'Mozilla/5.0', first)).status).toBe(429)
  expect((await request(path, 'Mozilla/5.0', second)).status).toBe(200)
  expect(build).toHaveBeenCalledTimes(2)
})
