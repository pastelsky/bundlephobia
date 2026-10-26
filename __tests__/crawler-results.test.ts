import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import Router from '@koa/router'
import cacheControl from 'koa-cache-control'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GetServerSidePropsContext } from 'next'
import type { NextRouter } from 'next/router'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'

import ResultPage, {
  getServerSideProps,
} from '../pages/package/[...packageString]/ResultPage'
import CacheServiceClient from '../server/clients/cache-service.client'
import { registerApiRoutes } from '../server/routes/api.route'
import { packageAnalysisGateway } from '../server/analysis'
import CustomError from '../server/custom-error'
import { parseJavaScriptPackageSpecifier } from '../languages/javascript'
import type { PackageBuildInfo } from '@bundlephobia/service-contracts/package'
import type { ExportsCacheResult } from '@bundlephobia/service-contracts/cache'
import { latestBuiltVersion } from '../cache-service/cache.utils.ts'

const older: PackageBuildInfo = {
  name: 'example',
  version: '1.2.3',
  size: 12345,
  gzip: 4567,
  description: 'Useful <img src=x onerror=alert(1)> package',
  repository: '',
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: false,
  hasJSNext: false,
  isModuleType: false,
}

const current = { ...older, version: '2.0.0' }

const cache = new CacheServiceClient()

const cached = new Map<string, PackageBuildInfo>()

const cachedExports = new Map<string, ExportsCacheResult>()

let server: Server

let baseURL: string

let client = 0

let resolve: jest.SpyInstance

let build: jest.SpyInstance

beforeAll(async () => {
  const app = new Koa()
  const routes = new Router()
  app.use(cacheControl())
  registerApiRoutes(routes, { cache, port: 0 })
  routes.get(/^\/package\/(.*)/, async ctx => {
    // SAFETY: this real HTTP request supplies the fields used by SSR; cookies are unused.
    const request = ctx.req as GetServerSidePropsContext['req']
    const packageString = ctx.path.slice('/package/'.length).split('/')

    const context = {
      params: { packageString },
      query: ctx.query,
      req: request,
      res: ctx.res,
      resolvedUrl: ctx.url,
    }

    ctx.res.statusCode = 200
    const { props } = await getServerSideProps(context)
    const status = ctx.res.statusCode
    // SAFETY: rendering only reads query/asPath from Next's router; navigation is not executed.
    const router = { query: { packageString }, asPath: ctx.url } as NextRouter
    ctx.body = renderToStaticMarkup(
      React.createElement(
        RouterContext.Provider,
        { value: router },
        React.createElement(ResultPage, props),
      ),
    )
    ctx.status = status
  })
  app.use(routes.routes())
  server = createServer(app.callback())
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  // SAFETY: server is bound to a TCP port above.
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(done => server.close(() => done())))

beforeEach(() => {
  jest.restoreAllMocks()
  cached.clear()
  cachedExports.clear()
  client += 1
  jest.spyOn(cache, 'getPackageSize').mockImplementation(async key => {
    const value = cached.get(`${key.name}@${key.version}`)

    return value ? { status: 'hit', value } : { status: 'miss' }
  })
  jest.spyOn(cache, 'setPackageSize').mockImplementation(async (key, value) => {
    // SAFETY: the real API's write boundary receives complete build results.
    cached.set(`${key.name}@${key.version}`, value as PackageBuildInfo)
  })
  jest.spyOn(cache, 'getExportsSize').mockImplementation(async key => {
    const value = cachedExports.get(`${key.name}@${key.version}`)

    return value ? { status: 'hit', value } : { status: 'miss' }
  })
  jest.spyOn(cache, 'setExportsSize').mockImplementation(async (key, value) => {
    cachedExports.set(`${key.name}@${key.version}`, value)
  })
  resolve = jest
    .spyOn(packageAnalysisGateway, 'resolvePackage')
    .mockImplementation(async reference => {
      const spec = parseJavaScriptPackageSpecifier(reference.specifier)

      if (spec.name === 'nonexistent')
        throw new CustomError('PackageNotFoundError', null, undefined)

      const version =
        spec.version &&
        packageAnalysisGateway.isExactVersionSpecifier(reference)
          ? spec.version
          : current.version

      return {
        ...current,
        name: spec.name,
        version,
        language: 'javascript',
        specifier: reference.specifier,
        displayName: spec.name,
        canonicalSpecifier: `${spec.name}@${version}`,
      }
    })
  build = jest
    .spyOn(packageAnalysisGateway, 'analyzePackage')
    .mockImplementation(async (resolved, options) => {
      options.onComplete?.(125)

      return { ...current, ...resolved }
    })
})

afterEach(() => jest.restoreAllMocks())

function request(path: string, headers: Record<string, string> = {}) {
  return fetch(baseURL + path, {
    headers: {
      'CF-Connecting-IP': `192.0.2.${client}`,
      'X-Bundlephobia-Prefer-Cached': 'true',
      ...headers,
    },
  })
}

it('selects the highest built stable version, not lexicographic order or a prerelease', () => {
  expect(latestBuiltVersion(['9,0,0', '10,0,0', '20,0,0-beta,1'])).toBe(
    '10.0.0',
  )
  expect(latestBuiltVersion([])).toBeNull()
})

it('serves older crawler facts without registry work, but visitors resolve current latest', async () => {
  cached.set('example@latest-built', older)
  cached.set('example@2.0.0', current)
  const crawler = await request('/api/size?package=example')
  expect(await crawler.json()).toMatchObject({ version: older.version })
  expect(crawler.headers.get('cache-control')).toContain('private')
  expect(crawler.headers.get('cache-control')).toContain('no-store')
  expect(resolve).not.toHaveBeenCalled()

  const visitor = await request('/api/size?package=example', {
    'X-Bundlephobia-Prefer-Cached': '',
  })

  expect(await visitor.json()).toMatchObject({ version: current.version })
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(build).not.toHaveBeenCalled()
})

it('does not change direct API results based on a crawler user agent', async () => {
  cached.set('example@2.0.0', current)

  const response = await request('/api/size?package=example', {
    'User-Agent': 'Googlebot',
    'X-Bundlephobia-Prefer-Cached': '',
  })

  expect(await response.json()).toMatchObject({ version: current.version })
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(build).not.toHaveBeenCalled()
})

it('renders the exact current visitor cache hit in the initial page response', async () => {
  cached.set('example@2.0.0', current)

  const response = await request('/package/example', {
    'X-Bundlephobia-Prefer-Cached': '',
  })

  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toContain('Bundle Size')
  expect(html).toContain('data-value="12.1"')
  expect(html).toContain('data-value="4.5"')
  expect(html).not.toContain('Resolving version and dependencies')
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(build).not.toHaveBeenCalled()
})

it('leaves visitor cache misses on the client build path without building in SSR', async () => {
  const response = await request('/package/example', {
    'X-Bundlephobia-Prefer-Cached': '',
  })

  expect(response.status).toBe(200)
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(build).not.toHaveBeenCalled()
})

it('falls back to client rendering when the visitor cache lookup stalls', async () => {
  let releaseCacheRead = () => {}

  const cacheRead = new Promise<void>(done => {
    releaseCacheRead = done
  })

  jest.spyOn(cache, 'getPackageSize').mockImplementation(async () => {
    await cacheRead

    return { status: 'miss' }
  })

  try {
    const response = await request('/package/example', {
      'X-Bundlephobia-Prefer-Cached': '',
    })

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('Bundle Size')
    expect(build).not.toHaveBeenCalled()
  } finally {
    releaseCacheRead()
  }
})

it('honours exact versions and force, without exempting force from build budgets', async () => {
  cached.set('example@latest-built', older)
  cached.set('example@2.0.0', current)
  expect(
    await (await request('/api/size?package=example@2.0.0')).json(),
  ).toMatchObject({ version: current.version })
  expect((await request('/api/size?package=example&force=true')).status).toBe(
    200,
  )
  expect(build).toHaveBeenCalledTimes(1)
  expect(
    (
      await request('/api/size?package=example&force=true', {
        'X-Bundlephobia-Build-Budget-Exceeded': 'true',
      })
    ).status,
  ).toBe(429)
  expect(build).toHaveBeenCalledTimes(1)
})

it('preserves real package 404s without starting builds', async () => {
  expect((await request('/api/size?package=nonexistent')).status).toBe(404)
  expect(build).not.toHaveBeenCalled()
})

it('does not mistake a cache outage for a missing package or start a build', async () => {
  jest
    .spyOn(cache, 'getPackageSize')
    .mockResolvedValue({ status: 'unavailable', error: new Error('offline') })
  expect((await request('/api/size?package=example')).status).toBe(503)
  expect(resolve).not.toHaveBeenCalled()
  expect(build).not.toHaveBeenCalled()
})

it('renders cached crawler facts and escaped descriptions directly in HTML', async () => {
  cached.set('example@latest-built', older)
  const response = await request('/package/example')
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain('Bundle Size')
  expect(html).toContain('Useful &lt;img')
  expect(html).not.toContain('result-pending')
  expect(resolve).not.toHaveBeenCalled()
  expect(build).not.toHaveBeenCalled()
})

it('keeps browser force requests on the existing client-side path', async () => {
  const response = await request('/package/example?force=true', {
    'X-Bundlephobia-Prefer-Cached': '',
  })

  expect(response.status).toBe(200)
  expect(resolve).not.toHaveBeenCalled()
  expect(build).not.toHaveBeenCalled()
})

it('waits for an admitted crawler page build and propagates duration and rejection status', async () => {
  const response = await request('/package/example')
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('Bundle Size')
  expect(response.headers.get('x-bundlephobia-build-duration-ms')).toBe('125')
  expect(build).toHaveBeenCalledTimes(1)

  const rejected = await request('/package/unbuilt', {
    'X-Bundlephobia-Build-Budget-Exceeded': 'true',
  })

  expect(rejected.status).toBe(429)
  expect(rejected.headers.get('retry-after')).toBe('300')
  expect((await request('/package/nonexistent')).status).toBe(404)
  expect(build).toHaveBeenCalledTimes(1)
})

describe.each(['size', 'exports-sizes'])(
  '%s build-response caching',
  endpoint => {
    it.each([
      ['package=example', 30],
      ['package=example@latest', 30],
      ['package=example@beta', 30],
      ['package=example@%5E2.0.0', 30],
      ['package=example@2.0.0', 86400],
      ['package=@scope/example@2.0.0', 86400],
      ['package=@scope&package=example@2.0.0', 86400],
      ['package=example@2.0.0&force=false', 0],
    ])(
      'keeps hit/miss HTTP lifetimes consistent for %s',
      async (query, ttl) => {
        const large = {
          ...current,
          description: 'A useful package. '.repeat(1000),
        }

        const exportsResult = {
          name: 'example',
          version: '2.0.0',
          assets: [{ name: 'export'.repeat(300), gzip: 123, type: 'js' }],
        }

        build.mockResolvedValue(large)
        jest
          .spyOn(packageAnalysisGateway, 'analyzePackageExportSizes')
          .mockResolvedValue(exportsResult)

        for (const [hit, userAgent] of [
          [false, 'Mozilla/5.0'],
          [true, 'Mozilla/5.0'],
          [true, 'Googlebot'],
        ] as const) {
          cached.clear()
          cachedExports.clear()

          if (hit) {
            const key = `${query.includes('@scope') ? '@scope/example' : 'example'}@2.0.0`

            cached.set(key, large)
            cachedExports.set(key, exportsResult)
          }

          const response = await request(`/api/${endpoint}?${query}`, {
            'X-Bundlephobia-Prefer-Cached': '',
            'User-Agent': userAgent,
            'Accept-Encoding': 'gzip, br',
          })

          expect(response.status).toBe(200)
          expect(response.headers.get('cache-control')).toBe(`max-age=${ttl}`)
          expect(response.headers.get('content-encoding')).toBeNull()
          expect(response.headers.get('content-type')).toContain(
            'application/json',
          )
          expect(response.headers.get('vary')).toContain('Accept-Encoding')
          expect(await response.json()).toMatchObject({ version: '2.0.0' })
        }
      },
    )

    it('keeps force requests uncached and bypasses stored build results', async () => {
      cached.set('example@2.0.0', current)
      cachedExports.set('example@2.0.0', {
        name: 'example',
        version: '2.0.0',
        assets: [],
      })
      build.mockResolvedValue({ ...current, size: 777 })

      const exportsBuild = jest
        .spyOn(packageAnalysisGateway, 'analyzePackageExportSizes')
        .mockResolvedValue({ assets: [{ name: 'fresh', gzip: 123 }] })

      const response = await request(
        `/api/${endpoint}?package=example@2.0.0&force=true`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('max-age=0')
      expect(await response.json()).toMatchObject(
        endpoint === 'size' ? { size: 777 } : { assets: [{ name: 'fresh' }] },
      )
      expect(endpoint === 'size' ? build : exportsBuild).toHaveBeenCalledTimes(
        1,
      )
    })

    it('does not store a temporary cache-only miss and sees the later result', async () => {
      const query = `/api/${endpoint}?package=example@2.0.0&peep=true`
      const missing = await request(query)

      expect(missing.status).toBe(404)
      expect(missing.headers.get('cache-control')).toContain('no-store')
      expect(build).not.toHaveBeenCalled()
      cached.set('example@2.0.0', current)
      cachedExports.set('example@2.0.0', {
        name: 'example',
        version: '2.0.0',
        assets: [],
      })

      const available = await request(query)

      expect(available.status).toBe(200)
      expect(available.headers.get('cache-control')).toBe('max-age=86400')
    })
  },
)

it('does not cache a negative export-size peek or start a build', async () => {
  const exportsBuild = jest.spyOn(
    packageAnalysisGateway,
    'analyzePackageExportSizes',
  )

  const response = await request(
    '/api/exports-sizes?package=example@2.0.0&peek=true',
  )

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(await response.json()).toMatchObject({ peekSuccess: false })
  expect(exportsBuild).not.toHaveBeenCalled()
})
