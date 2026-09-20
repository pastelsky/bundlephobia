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
import {
  buildApiCatalog,
  CATALOG_CONTENT_TYPE,
  linkHeaderMiddleware,
} from './server/agentDiscovery'

import limit from './server/middlewares/rateLimit.middleware'
import exportsMiddlware from './server/middlewares/exports.middleware'
import { createExportSizesMiddleware } from './server/middlewares/exportsSizes.middleware'
import blockBlacklistMiddleware from './server/middlewares/results/blockBlacklist.middleware'
import { createResolvePackageMiddleware } from './server/middlewares/results/resolvePackage.middleware'
import cachedResponseMiddleware from './server/middlewares/results/cachedResponse.middleware'
import { createBuildMiddleware } from './server/middlewares/results/build.middleware'
import errorMiddleware from './server/middlewares/results/error.middleware'
import requestLoggerMiddleware from './server/middlewares/requestLogger.middleware'
import similarPackagesMiddleware from './server/middlewares/similar-packages/similarPackages.middleware'
import { createGenerateImgMiddleware } from './server/middlewares/generateImg.middleware'
import buildMissRateLimit from './server/middlewares/buildMissRateLimit.middleware'

import jsonCacheMiddleware from './server/middlewares/jsonCache.middleware'

import type {
  CacheKey,
  ExportsCacheResult,
  PackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

import config from './server/config'
import { createAnalysisContextMiddleware } from './server/analysis'
import { createMcpController } from './server/mcp/controller'
import { fetchPackageHistory } from './server/packageHistory'

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

const buildMiddleware = createBuildMiddleware(cache)

const exportSizesMiddleware = createExportSizesMiddleware(cache)

const generateImgMiddleware = createGenerateImgMiddleware(cache)

const port = env.port

const dev = env.nodeEnv !== 'production'

const app = next({ dev })

const handle = app.getRequestHandler()

function getQueryValue(
  value: string | string[] | undefined,
  joinArrays = false,
): string | undefined {
  if (Array.isArray(value)) {
    return joinArrays ? value.join('/') : undefined
  }

  return value
}

function getPackageHistoryLimit(value: string | string[] | undefined): number {
  const requestedLimit = Number(getQueryValue(value))

  return Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 40
}

function getPackageHistoryDateError(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  for (const date of [from, to]) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'from and to must be YYYY-MM-DD dates'
    }
  }

  if (from && to && from > to) {
    return 'from must not be after to'
  }

  return undefined
}

app.prepare().then(() => {
  const server = new Koa()
  const router = new Router()
  const mcpController = createMcpController(port)

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

  router.get(
    '/api/size',
    jsonCacheMiddleware({
      get: (key: CacheKey) => cache.getPackageSize(key),
      set: (key: CacheKey, value: PackageCacheResult) =>
        cache.setPackageSize(key, value),
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
      get: (key: CacheKey) => cache.getExportsSize(key),
      set: (key: CacheKey, value: ExportsCacheResult) =>
        cache.setExportsSize(key, value),
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
    exportSizesMiddleware,
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
    const packageString = getQueryValue(ctx.query.package, true)

    invariant(packageString, 'package parameter is required')
    const { name } = parsePackageString(packageString)
    const from = getQueryValue(ctx.query.from)
    const to = getQueryValue(ctx.query.to)
    const limit = getPackageHistoryLimit(ctx.query.limit)
    const dateError = getPackageHistoryDateError(from, to)

    if (dateError) {
      ctx.throw(400, dateError)
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

  router.get('/api/mcp/tools', mcpController.listTools)

  router.post('/api/mcp/call-tool', mcpController.callTool)

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
