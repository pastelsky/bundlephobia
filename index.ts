require('dotenv-defaults').config()

import next from 'next'
import exec from 'execa'
import { parse } from 'url'

import Koa, { Context } from 'koa'
import proxy from 'koa-proxy'
import serve from 'koa-static'
import Router from '@koa/router'
import cacheControl from 'koa-cache-control'
import requestId from 'koa-requestid'
import auth from 'koa-basic-auth'
import bodyParser from 'koa-bodyparser'
import invariant from 'ts-invariant'

import CacheServiceClient from './server/clients/cacheService'
import { parsePackageString } from './utils/common.utils'
import firebaseUtils from './utils/firebase.utils'
import logger from './server/Logger'
import type { JsonObject } from './types/json'
import remoteMcpClient from './server/mcp/remoteClient'
import {
  buildApiCatalog,
  CATALOG_CONTENT_TYPE,
  linkHeaderMiddleware,
} from './server/agentDiscovery'

import limit from './server/middlewares/rateLimit.middleware'
import exportsMiddlware from './server/middlewares/exports.middleware'
import exportsSizesMiddlware from './server/middlewares/exportsSizes.middleware'
import blockBlacklistMiddleware from './server/middlewares/results/blockBlacklist.middleware'
import { createResolvePackageMiddleware } from './server/middlewares/results/resolvePackage.middleware'
import cachedResponseMiddleware from './server/middlewares/results/cachedResponse.middleware'
import buildMiddleware from './server/middlewares/results/build.middleware'
import errorMiddleware from './server/middlewares/results/error.middleware'
import requestLoggerMiddleware from './server/middlewares/requestLogger.middleware'
import similarPackagesMiddleware from './server/middlewares/similar-packages/similarPackages.middleware'
import generateImgMiddleware from './server/middlewares/generateImg.middleware'
import buildMissRateLimit from './server/middlewares/buildMissRateLimit.middleware'

import jsonCacheMiddleware from './server/middlewares/jsonCache.middleware'

import config from './server/config'
import { createAnalysisContextMiddleware } from './server/analysis'

function getEnv(env: Record<string, string | undefined | null>) {
  invariant(
    env.BASIC_AUTH_PASSWORD,
    'Environment variable BASIC_AUTH_PASSWORD is required',
  )
  invariant(env.NODE_ENV, 'Environment variable NODE_ENV is required')

  return {
    basicAuthPassword: env.BASIC_AUTH_PASSWORD,
    port: env.PORT ? parseInt(env.PORT) : config.DEFAULT_DEV_PORT,
    nodeEnv: env.NODE_ENV,
  }
}

import { monitorEventLoopDelay } from 'node:perf_hooks'

const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 })

eventLoopDelay.enable()

setInterval(() => {
  const p99Ms = eventLoopDelay.percentile(99) / 1e6
  const maxMs = eventLoopDelay.max / 1e6

  if (p99Ms > 50) {
    logger.info(
      'EVENT_LOOP_LAG',
      { p99Ms, maxMs },
      `High event loop latency detected: p99=${p99Ms.toFixed(1)}ms max=${maxMs.toFixed(1)}ms`,
    )
  }

  eventLoopDelay.reset()
}, 10000)

const env = getEnv(process.env)

const cache = new CacheServiceClient()

const port = env.port

const dev = env.nodeEnv !== 'production'

const app = next({ dev })

const handle = app.getRequestHandler()

type McpArguments = JsonObject

type McpPayload = { name: string; arguments?: McpArguments }

const localMcpPathBuilders = new Map([
  [
    'bundlephobia.size',
    ({ packageName }: { packageName: string }) =>
      `/api/size?package=${packageName}`,
  ],
  [
    'bundlephobia.exports',
    ({ packageName }: { packageName: string }) =>
      `/api/exports?package=${packageName}`,
  ],
  [
    'bundlephobia.exportsSizes',
    ({ packageName }: { packageName: string }) =>
      `/api/exports-sizes?package=${packageName}`,
  ],
  [
    'bundlephobia.packageHistory',
    ({ packageName, args }: { packageName: string; args: McpArguments }) => {
      const params = new URLSearchParams({
        package: packageName,
        limit: String(Number(args.limit ?? 40)),
      })
      if (typeof args.from === 'string') params.set('from', args.from)
      if (typeof args.to === 'string') params.set('to', args.to)
      return `/api/package-history?${params}`
    },
  ],
  [
    'bundlephobia.similarPackages',
    ({ packageName }: { packageName: string }) =>
      `/api/similar-packages?package=${packageName}`,
  ],
])

function getLocalMcpRequest(name: string, args: McpArguments) {
  const buildPath = localMcpPathBuilders.get(name)

  if (!buildPath) return null

  const packageArgument = args.package

  const packageName =
    Object.prototype.toString.call(packageArgument) === '[object String]'
      ? encodeURIComponent(String(packageArgument))
      : undefined

  return packageName
    ? { path: buildPath({ packageName, args }) }
    : { invalid: true as const }
}

function isMcpPayload(value: unknown): value is McpPayload {
  if (
    value === null ||
    value === undefined ||
    Object.prototype.toString.call(value) !== '[object Object]' ||
    !('name' in Object(value))
  ) {
    return false
  }

  // SAFETY: the object-tag and property-presence checks establish the payload shape.
  const name = (value as { name: unknown }).name

  return (
    Object.prototype.toString.call(name) === '[object String]' &&
    String(name).length > 0
  )
}

app.prepare().then(() => {
  const server = new Koa()
  const router = new Router()

  server.use(requestId())
  server.use(bodyParser())
  server.use(requestLoggerMiddleware)
  server.use(cacheControl())
  server.use(linkHeaderMiddleware)

  if (!dev) {
    server.use(
      limit({
        duration: 1000 * 60 * 5, //  5 mins
        max: 120,
        whiteList: ['127.0.0.1', '::1'],
      }),
    )
  }

  server.use(async (ctx, nextMiddleware) => {
    try {
      await nextMiddleware()
    } catch (err) {
      if (err instanceof Error && 'status' in err && err.status === 401) {
        ctx.status = 401
        ctx.set('WWW-Authenticate', 'Basic')
        ctx.body = 'Permission denied'
      } else {
        throw err
      }
    }
  })

  server.use(
    serve('./client/assets/public', {
      maxage: config.CACHE.PUBLIC_ASSETS * 1000,
    }),
  )

  server.use(
    proxy({
      match: /^\/-\/search/,
      host: 'https://www.npmjs.com',
    }),
  )

  type Key = {
    name: string
    version: string
  }

  router.get(
    '/api/size',
    jsonCacheMiddleware({
      get: (key: Key) => cache.getPackageSize(key),
      set: (key: Key, value: string) => cache.setPackageSize(key, value),
      hash: (ctx: Context) => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    createAnalysisContextMiddleware('package-analysis'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-analysis'),
    cachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    buildMiddleware,
  )

  router.get(
    '/api/exports',
    createAnalysisContextMiddleware('package-exports'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-exports'),
    exportsMiddlware,
  )

  router.get(
    '/api/exports-sizes',
    jsonCacheMiddleware({
      get: (key: Key) => cache.getExportsSize(key),
      set: (key: Key, value: string) => cache.setExportsSize(key, value),
      hash: (ctx: Context) => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    createAnalysisContextMiddleware('package-export-sizes'),
    errorMiddleware,
    blockBlacklistMiddleware,
    createResolvePackageMiddleware('package-export-sizes'),
    cachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    exportsSizesMiddlware,
  )

  router.get('/api/recent', async ctx => {
    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.RECENTS_API,
      }
      ctx.body = await firebaseUtils.getRecentSearches(Number(ctx.query.limit))
    } catch (err) {
      console.error('in /api/recent', err)
      const message = err instanceof Error ? err.message : String(err)
      const errorName = err instanceof Error ? err.name : 'Error'
      logger.error('RECENT', err, 'RECENT FAILED: failed')
      ctx.status = 422
      ctx.body = { type: errorName, message }
    }
  })

  router.get('/api/package-history', async ctx => {
    const packageQuery = ctx.query.package

    const packageString = Array.isArray(packageQuery)
      ? packageQuery.join('/')
      : packageQuery

    invariant(packageString, 'package parameter is required')
    const { name } = parsePackageString(packageString)
    const from = typeof ctx.query.from === 'string' ? ctx.query.from : undefined
    const to = typeof ctx.query.to === 'string' ? ctx.query.to : undefined
    const requestedLimit = Number(ctx.query.limit)
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 40

    for (const date of [from, to]) {
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        ctx.throw(400, 'from and to must be YYYY-MM-DD dates')
      }
    }
    if (from && to && from > to) {
      ctx.throw(400, 'from must not be after to')
    }

    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.PACKAGE_HISTORY_API,
      }
      ctx.body = await fetchPackageHistory(name, { from, to, limit })
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : String(err)
      const errorName = err instanceof Error ? err.name : 'Error'
      logger.error(
        'HISTORY',
        err,
        'HISTORY FAILED: for package' + ctx.query.package,
      )
      ctx.status = 422
      ctx.body = { type: errorName, message }
    }
  })

  router.get('/api/similar-packages', similarPackagesMiddleware)

  router.get('/api/stats-image', generateImgMiddleware)

  router.get('/api/mcp/tools', async ctx => {
    try {
      const localTools = [
        {
          name: 'bundlephobia.size',
          description: 'Get package size result via /api/size',
          inputSchema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: { type: 'string' },
            },
          },
        },
        {
          name: 'bundlephobia.exports',
          description: 'Get package exports via /api/exports',
          inputSchema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: { type: 'string' },
            },
          },
        },
        {
          name: 'bundlephobia.exportsSizes',
          description: 'Get package exports sizes via /api/exports-sizes',
          inputSchema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: { type: 'string' },
            },
          },
        },
        {
          name: 'bundlephobia.packageHistory',
          description: 'Get package history via /api/package-history',
          inputSchema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: { type: 'string' },
              limit: { type: 'number' },
            },
          },
        },
        {
          name: 'bundlephobia.similarPackages',
          description: 'Get similar packages via /api/similar-packages',
          inputSchema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: { type: 'string' },
            },
          },
        },
      ]

      if (!remoteMcpClient.isEnabled()) {
        ctx.body = { tools: localTools }

        return
      }

      // SAFETY: the remote MCP client returns the documented tools envelope.
      const remote = (await remoteMcpClient.listTools()) as {
        tools?: JsonObject[]
      }

      ctx.body = {
        tools: [...localTools, ...(remote.tools ?? [])],
      }
    } catch (error) {
      remoteMcpClient.resetConnection(error)
      logger.error('MCP_API', error, 'Failed to list MCP tools')
      ctx.status = 502
      ctx.body = { error: { code: 'McpListToolsFailed' } }
    }
  })

  router.post('/api/mcp/call-tool', async ctx => {
    const payload = ctx.request.body

    if (!isMcpPayload(payload)) {
      ctx.status = 400
      ctx.body = {
        error: { code: 'InvalidMcpPayload', message: '`name` is required' },
      }

      return
    }

    try {
      const args = payload.arguments ?? {}

      const callLocalApi = async (path: string) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            'X-Bundlephobia-User': 'bundlephobia mcp tool',
          },
        })

        const body = await response.json()

        return {
          status: response.status,
          body,
        }
      }

      const localRequest = getLocalMcpRequest(payload.name, args)

      if (localRequest?.invalid) {
        ctx.status = 400
        ctx.body = { error: { code: 'InvalidMcpPayload' } }

        return
      }

      if (localRequest) {
        ctx.body = await callLocalApi(localRequest.path)

        return
      }

      if (!remoteMcpClient.isEnabled()) {
        ctx.status = 404
        ctx.body = { error: { code: 'McpNotConfigured' } }

        return
      }

      ctx.body = await remoteMcpClient.callTool({
        name: payload.name,
        arguments: payload.arguments,
      })
    } catch (error) {
      remoteMcpClient.resetConnection(error)
      logger.error('MCP_API', error, `Failed MCP tool call: ${payload.name}`)
      ctx.status = 502
      ctx.body = { error: { code: 'McpCallToolFailed' } }
    }
  })

  router.get(
    '/admin/restart',
    auth({ name: 'bundlephobia', pass: env.basicAuthPassword }),
    async ctx => {
      try {
        const { stdout } = await exec.command('pm2 reload all')
        ctx.body = 'Server restarted' + stdout
      } catch (err) {
        console.error('Failed to restart', err)
        ctx.status = 500
        ctx.body = err
      }
    },
  )

  router.post('/admin/restart', async ctx => {
    // SAFETY: the admin endpoint body is parsed from its documented credentials contract.
    const { name, pass } = <{ name?: string; pass?: string }>ctx.request.body

    if (name !== 'bundlephobia' || pass !== env.basicAuthPassword) {
      console.error('Failed to restart')
      ctx.status = 500
      ctx.body = 'Failed to restart'
    } else {
      const { stdout, stderr } = await exec.command('pm2 reload all')
      ctx.body = 'Server restarted' + stdout
      console.error(stderr)
    }
  })

  router.get(
    '/admin/clear-cache',
    auth({ name: 'bundlephobia', pass: env.basicAuthPassword }),
    async ctx => {
      try {
        const { stdout } = await exec.command(
          'rm -rf /tmp/tmp-build/cache/_cacache /tmp/tmp-build/packages/',
        )

        ctx.body = 'Cache cleared' + stdout
      } catch (err) {
        console.error('Failed to clear cache', err)
        ctx.status = 500
        ctx.body = err
      }
    },
  )

  router.get('/.well-known/api-catalog', async ctx => {
    ctx.cacheControl = {
      maxAge: config.CACHE.PUBLIC_ASSETS,
    }
    // Set explicitly rather than via ctx.type, which would run the media type
    // through mime lookup and append a charset after the profile parameter.
    ctx.set('Content-Type', CATALOG_CONTENT_TYPE)
    ctx.body = buildApiCatalog()
  })

  router.get('/result', async ctx => {
    invariant(ctx.query.p, 'p parameter is required')

    const packageString = Array.isArray(ctx.query.p)
      ? ctx.query.p.join('/')
      : ctx.query.p

    ctx.redirect(`/package/${packageString.trim()}`)
    ctx.status = 301
  })

  router.get('(.*)', async ctx => {
    invariant(ctx.req.url, 'url is missing')
    const parsedUrl = parse(ctx.req.url, true)
    await handle(ctx.req, ctx.res, parsedUrl)
    ctx.respond = false
  })

  server.use(async (ctx, nextMiddleware) => {
    ctx.res.statusCode = 200
    await nextMiddleware()
  })

  server.use(router.routes())
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
