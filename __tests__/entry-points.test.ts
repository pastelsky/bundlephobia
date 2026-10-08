import Koa from 'koa'
import Router from '@koa/router'
import Fastify from 'fastify'
import firebase from 'firebase'
import type { Server } from 'node:http'
import { ENTRY_POINT_HEADER } from '@bundlephobia/service-contracts/package'
import {
  CACHE_ROUTE,
  cacheStoragePath,
  parsePackageCacheResult,
  parseExportsCacheResult,
  parseNamedExportsCacheResult,
  parseEntryPointsCacheResult,
  type CacheEntry,
  type CacheKey,
} from '@bundlephobia/service-contracts/cache'
import { createCacheRepository } from '../cache-service/cache.repository'
import { createCacheHandlers } from '../cache-service/cache.handlers'
import { cacheConfig } from '../cache-service/cache.config'
import CacheServiceClient from '../server/clients/cache-service.client'
import { registerApiRoutes } from '../server/routes/api.route'
import { packageAnalysisGateway } from '../server/analysis'
import { pool, requestQueue } from '../server/infrastructure/runtime'

const records = new Map<string, CacheEntry>()

function reference(path = '') {
  return {
    child: (segment: string) =>
      reference([path, segment].filter(Boolean).join('/')),
    once: async () => ({ val: () => records.get(path) ?? null }),
    set: async (value: CacheEntry) => {
      records.set(path, value)
    },
  }
}

const calls: string[] = []

let outdatedBuildService = false

const imports = ['.', './map.js', './debounce.js']

const parsers = {
  package: parsePackageCacheResult,
  exports: parseExportsCacheResult,
  namedExports: parseNamedExportsCacheResult,
  entryPoints: parseEntryPointsCacheResult,
}

const cacheServer = Fastify()

const buildServer = Fastify()

let server: Server

let baseUrl: string

const originalEndpoint = process.env.BUILD_SERVICE_ENDPOINT

async function get(operation: string, entryPoint?: string, force = false) {
  const params = new URLSearchParams({ package: 'example@1.0.0' })

  if (entryPoint) params.set('entryPoint', entryPoint)

  if (force) params.set('force', 'true')
  const response = await fetch(`${baseUrl}/api/${operation}?${params}`)

  return { status: response.status, body: await response.json() }
}

describe('public entry-point API and durable cache', () => {
  beforeAll(async () => {
    // SAFETY: the fixture implements every Firebase reference operation used by the repository.
    jest
      .spyOn(firebase, 'database')
      .mockImplementation(() => ({ ref: () => reference() }) as never)

    // SAFETY: CACHE_ROUTE is the closed shared route table used by the real cache service.
    for (const label of Object.keys(
      CACHE_ROUTE,
    ) as (keyof typeof CACHE_ROUTE)[]) {
      const handlers = createCacheHandlers<CacheKey>({
        label,
        repository: createCacheRepository(cacheConfig[label]),
        parseResult: parsers[label],
      })

      cacheServer.get(CACHE_ROUTE[label], handlers.get)
      cacheServer.post(CACHE_ROUTE[label], handlers.post)
    }

    for (const operation of [
      'size',
      'exports',
      'exports-sizes',
      'entry-points',
    ]) {
      buildServer.get(`/${operation}`, async (request, reply) => {
        // SAFETY: requests originate from BuildService's documented query contract.
        const query = request.query as { p: string; entryPoint?: string }
        const entryPoint = query.entryPoint ?? '.'

        if (!outdatedBuildService)
          reply.header(ENTRY_POINT_HEADER, encodeURIComponent(entryPoint))
        calls.push(`${operation}:${entryPoint}`)
        await new Promise(resolve => setTimeout(resolve, 15))

        if (entryPoint === './missing.js') {
          return reply
            .code(500)
            .send({ name: 'EntryPointError', originalError: 'Not exported' })
        }

        const size = [1000, 200, 50][imports.indexOf(entryPoint)]

        if (operation === 'entry-points') return imports

        if (operation === 'exports') return { selected: entryPoint }

        if (operation === 'exports-sizes')
          return { assets: [{ name: entryPoint, gzip: size / 2 }] }

        return {
          size,
          gzip: size / 2,
          dependencyCount: 0,
          hasSideEffects: false,
          hasJSModule: true,
          hasJSNext: false,
          isModuleType: true,
        }
      })
    }

    const cacheUrl = await cacheServer.listen({ port: 0, host: '127.0.0.1' })
    process.env.BUILD_SERVICE_ENDPOINT = await buildServer.listen({
      port: 0,
      host: '127.0.0.1',
    })
    jest.spyOn(packageAnalysisGateway, 'resolvePackage').mockResolvedValue({
      language: 'javascript',
      specifier: 'example@1.0.0',
      name: 'example',
      version: '1.0.0',
      displayName: 'example',
      canonicalSpecifier: 'example@1.0.0',
      description: '',
      repository: '',
    })
    const app = new Koa()
    const router = new Router()
    registerApiRoutes(router, {
      cache: new CacheServiceClient({ endpoint: cacheUrl }),
      port: 0,
    })
    app.use(router.routes())
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()

    if (
      !address ||
      Object.prototype.toString.call(address) === '[object String]'
    )
      throw new Error('Missing API port')
    // SAFETY: the server is listening on a TCP port, not a named pipe.
    baseUrl = `http://127.0.0.1:${(address as import('node:net').AddressInfo).port}`
  })

  afterAll(async () => {
    await Promise.all([
      cacheServer.close(),
      buildServer.close(),
      new Promise<void>(resolve => server.close(() => resolve())),
    ])
    requestQueue.clear()
    pool.terminate()

    if (originalEndpoint === undefined)
      delete process.env.BUILD_SERVICE_ENDPOINT
    else process.env.BUILD_SERVICE_ENDPOINT = originalEndpoint
    jest.restoreAllMocks()
  })

  it('keeps root and subpath results distinct through builds, cache hits, force and cache-service restarts', async () => {
    for (const operation of ['size', 'exports', 'exports-sizes']) {
      for (const entryPoint of imports) {
        const cold = await get(operation, entryPoint)
        expect(cold.status).toBe(200)
        expect(cold.body.entryPoint).toBe(
          entryPoint === '.' ? undefined : entryPoint,
        )
        const before = calls.length
        expect(await get(operation, entryPoint)).toEqual(cold)
        expect(calls).toHaveLength(before)
        expect(await get(operation, entryPoint, true)).toEqual(cold)
        expect(calls).toHaveLength(before + 1)
      }
    }

    expect((await get('size')).body.size).toBe(1000)
    expect((await get('size', './map.js')).body.size).toBe(200)
    expect((await get('size', './debounce.js')).body.size).toBe(50)
    const fresh = createCacheRepository(cacheConfig.package)

    for (const entryPoint of imports) {
      const result = await fresh.get({
        name: 'example',
        version: '1.0.0',
        entryPoint,
      })

      expect(result).toMatchObject({
        size: [1000, 200, 50][imports.indexOf(entryPoint)],
      })
    }
  })

  it('discovers entries independently, deduplicates concurrent work and isolates unavailable paths', async () => {
    const before = calls.length

    const results = await Promise.all([
      get('entry-points'),
      get('entry-points'),
      get('entry-points'),
    ])

    expect(results.every(result => result.status === 200)).toBe(true)
    expect(results[0].body).toEqual({
      name: 'example',
      version: '1.0.0',
      entryPoints: imports,
    })
    expect(calls).toHaveLength(before + 1)
    expect(await get('entry-points')).toEqual(results[0])
    expect(calls).toHaveLength(before + 1)
    expect((await get('size', './missing.js')).status).toBe(422)
    expect((await get('size', './missing.js')).status).toBe(422)
    expect((await get('size')).status).toBe(200)
    expect((await get('size', './map.js')).status).toBe(200)
    expect((await get('entry-points')).status).toBe(200)

    const parallel = await Promise.all(
      imports.map(entryPoint => get('size', entryPoint, true)),
    )

    expect(parallel.map(result => result.body.size)).toEqual([1000, 200, 50])
  })

  it('rejects unsafe paths and mismatched cache identities without falling back to root data', async () => {
    const before = calls.length

    for (const entryPoint of [
      '../secret',
      './x/../secret',
      './x//y',
      './*',
      './x\\y',
      '',
    ]) {
      const params = new URLSearchParams({
        package: 'example@1.0.0',
        entryPoint,
      })

      expect((await fetch(`${baseUrl}/api/size?${params}`)).status).toBe(400)
    }

    expect((await get('entry-points', './map.js')).status).toBe(400)
    expect(calls).toHaveLength(before)

    outdatedBuildService = true
    expect((await get('size', './map.js', true)).status).toBe(503)
    outdatedBuildService = false
    expect((await get('size', './map.js')).body.size).toBe(200)
    const key = { name: 'example', version: '1.0.0', entryPoint: './map.js' }

    const response = await cacheServer.inject({
      method: 'POST',
      url: CACHE_ROUTE.package,
      payload: {
        ...key,
        result: { name: 'example', version: '1.0.0', size: 999, gzip: 99 },
      },
    })

    expect(response.statusCode).toBe(422)

    // SAFETY: this Axios fixture supplies the response envelope exercised by the client.
    const client = new CacheServiceClient({
      api: {
        get: jest.fn(async () => ({
          data: {
            name: 'example',
            version: '1.0.0',
            size: 999,
            gzip: 99,
          },
        })) as never,
        post: jest.fn(),
      },
    })

    expect(await client.getPackageSize(key)).toMatchObject({
      status: 'invalid',
    })
    records.set(
      cacheStoragePath('modules-v2', { name: 'legacy', version: '1.0.0' }).join(
        '/',
      ),
      { name: 'legacy', version: '1.0.0', size: 999, gzip: 99 },
    )

    const fresh = createCacheRepository({
      readKey: 'modules-v3',
      writeKey: 'modules-v3',
      fallbackReadKey: 'modules-v2',
      memoryMax: 10,
    })

    expect(await fresh.get({ name: 'legacy', version: '1.0.0' })).toMatchObject(
      { size: 999 },
    )
    expect(
      await fresh.get({
        name: 'legacy',
        version: '1.0.0',
        entryPoint: './map.js',
      }),
    ).toBeNull()
    expect(
      cacheStoragePath('modules-v3', { ...key, entryPoint: './a.b' }),
    ).not.toEqual(
      cacheStoragePath('modules-v3', { ...key, entryPoint: './a,b' }),
    )
  })
})
