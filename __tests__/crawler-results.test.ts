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
import firebaseUtils from '../utils/firebase.utils'
import { parseJavaScriptPackageSpecifier } from '../languages/javascript'
import type { PackageBuildInfo } from '@bundlephobia/service-contracts/package'
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
  routes.get('/package/(.*)', async ctx => {
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
  client += 1
  jest.spyOn(cache, 'getPackageSize').mockImplementation(async key => {
    const value = cached.get(`${key.name}@${key.version}`)

    return value ? { status: 'hit', value } : { status: 'miss' }
  })
  jest.spyOn(cache, 'setPackageSize').mockImplementation(async (key, value) => {
    // SAFETY: the real API's write boundary receives complete build results.
    cached.set(`${key.name}@${key.version}`, value as PackageBuildInfo)
  })
  resolve = jest
    .spyOn(packageAnalysisGateway, 'resolvePackage')
    .mockImplementation(async reference => {
      const spec = parseJavaScriptPackageSpecifier(reference.specifier)

      if (spec.name === 'nonexistent')
        throw new CustomError('PackageNotFoundError', null, undefined)

      return {
        ...current,
        name: spec.name,
        version:
          spec.version && spec.version !== 'latest'
            ? spec.version
            : current.version,
        language: 'javascript',
        specifier: reference.specifier,
        displayName: spec.name,
        canonicalSpecifier: `${spec.name}@${spec.version ?? current.version}`,
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

// Exercise both cold and cached responses through the real HTTP middleware stack.
it.each([
  ['example', 30],
  ['example@latest', 30],
  ['example@2.0.0', 86400],
  ['@scope/example@2.0.0', 86400],
  ['example@2.0.0&force=false', 0],
])(
  'preserves request cache lifetime and edge compression for %s',
  async (specifier, ttl) => {
    const large = { ...current, description: 'A useful package. '.repeat(1000) }

    build.mockResolvedValue(large)

    for (const hit of [false, true]) {
      cached.clear()

      if (hit)
        cached.set(
          `${specifier.startsWith('@scope/') ? '@scope/example' : 'example'}@2.0.0`,
          large,
        )

      const response = await request(`/api/size?package=${specifier}`, {
        'X-Bundlephobia-Prefer-Cached': '',
        'Accept-Encoding': 'gzip',
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe(`max-age=${ttl}`)
      expect(response.headers.get('content-encoding')).toBeNull()
      expect(response.headers.get('vary')).toContain('Accept-Encoding')
      expect(await response.json()).toMatchObject({ version: '2.0.0' })
    }
  },
)

it('does not cache an upstream recent-search failure for the success lifetime', async () => {
  jest
    .spyOn(firebaseUtils, 'getRecentSearches')
    .mockRejectedValue(new Error('temporary upstream failure'))

  const response = await request('/api/recent?limit=5')

  expect(response.status).toBe(422)
  expect(response.headers.get('cache-control')).toContain('no-store')
})

it('does not retain a cache-only miss after a result becomes available', async () => {
  const response = await request('/api/size?package=example@2.0.0&peep=true')

  expect(response.status).toBe(404)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(build).not.toHaveBeenCalled()
})
