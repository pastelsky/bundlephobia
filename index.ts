require('dotenv-defaults').config()

import next from 'next'
import exec from 'execa'
import { parse } from 'url'

import Koa, { Context } from 'koa'
import proxy from 'koa-proxy'
import serve from 'koa-static'
import Router from '@koa/router'
import compress from 'koa-compress'
import cacheControl from 'koa-cache-control'
import requestId from 'koa-requestid'
import auth from 'koa-basic-auth'
import bodyParser from 'koa-bodyparser'
import invariant from 'ts-invariant'

import Cache from './utils/cache.utils'
import { parsePackageString } from './utils/common.utils'
import firebaseUtils from './utils/firebase.utils'
import logger from './server/Logger'
import remoteMcpClient from './server/mcp/remoteClient'

import limit from './server/middlewares/rateLimit.middleware'
import exportsMiddlware from './server/middlewares/exports.middleware'
import exportsSizesMiddlware from './server/middlewares/exportsSizes.middleware'
import resolvePackageMiddleware from './server/middlewares/results/resolvePackage.middleware'
import cachedResponseMiddleware from './server/middlewares/results/cachedResponse.middleware'
import buildMiddleware from './server/middlewares/results/build.middleware'
import errorMiddleware from './server/middlewares/results/error.middleware'
import blockBlacklistMiddleware from './server/middlewares/results/blockBlacklist.middleware'
import requestLoggerMiddleware from './server/middlewares/requestLogger.middleware'
import similarPackagesMiddleware from './server/middlewares/similar-packages/similarPackages.middleware'
import generateImgMiddleware from './server/middlewares/generateImg.middleware'
import buildMissRateLimit from './server/middlewares/buildMissRateLimit.middleware'

import jsonCacheMiddleware from './server/middlewares/jsonCache.middleware'

import config from './server/config'

function getEnv(env: Record<string, string | undefined | null>) {
  invariant(
    env.BASIC_AUTH_PASSWORD,
    'Environment variable BASIC_AUTH_PASSWORD is required'
  )
  invariant(env.NODE_ENV, 'Environment variable NODE_ENV is required')

  return {
    basicAuthPassword: env.BASIC_AUTH_PASSWORD,
    port: env.PORT ? parseInt(env.PORT) : config.DEFAULT_DEV_PORT,
    nodeEnv: env.NODE_ENV,
  }
}

const env = getEnv(process.env)

const cache = new Cache()
const port = env.port
const dev = env.nodeEnv !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = new Koa()
  const router = new Router()

  server.use(requestId())
  server.use(bodyParser())
  server.use(requestLoggerMiddleware)
  server.use(cacheControl())

  if (!dev) {
    server.use(
      limit({
        duration: 1000 * 60 * 5, //  5 mins
        max: 120,
        whiteList: ['127.0.0.1', '::1'],
      })
    )
  }

  server.use(async (ctx, next) => {
    try {
      await next()
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
    compress({
      filter: function (contentType) {
        return /(text|json|javascript|svg)/.test(contentType)
      },
      threshold: 2048,
      gzip: {
        flush: require('zlib').Z_SYNC_FLUSH,
      },
    })
  )

  server.use(
    serve('./client/assets/public', {
      maxage: config.CACHE.PUBLIC_ASSETS * 1000,
    })
  )

  server.use(
    proxy({
      match: /^\/-\/search/,
      host: 'https://www.npmjs.com',
    })
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
    errorMiddleware,
    resolvePackageMiddleware,
    blockBlacklistMiddleware,
    cachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    buildMiddleware
  )

  router.get(
    '/api/exports',
    errorMiddleware,
    resolvePackageMiddleware,
    blockBlacklistMiddleware,
    exportsMiddlware
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
    errorMiddleware,
    resolvePackageMiddleware,
    blockBlacklistMiddleware,
    cachedResponseMiddleware,
    buildMissRateLimit({
      durationMs: 1000 * 60 * 5,
      maxRequests: 10,
      whiteList: ['127.0.0.1', '::1'],
    }),
    exportsSizesMiddlware
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
      const name = err instanceof Error ? err.name : 'Error'
      logger.error('RECENT', err, 'RECENT FAILED: failed')
      ctx.status = 422
      ctx.body = { type: name, message }
    }
  })

  router.get('/api/package-history', async ctx => {
    const packageQuery = ctx.query.package
    const packageString =
      typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

    invariant(packageString, 'package parameter is required')
    const { name } = parsePackageString(packageString)
    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.PACKAGE_HISTORY_API,
      }
      ctx.body = await firebaseUtils.getPackageHistory(
        name,
        Number(ctx.query.limit)
      )
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : 'Error'
      logger.error(
        'HISTORY',
        err,
        'HISTORY FAILED: for package' + ctx.query.package
      )
      ctx.status = 422
      ctx.body = { type: name, message }
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

      const remote = (await remoteMcpClient.listTools()) as {
        tools?: Array<Record<string, unknown>>
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
    const payload = ctx.request.body as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined

    if (!payload?.name || typeof payload.name !== 'string') {
      ctx.status = 400
      ctx.body = {
        error: { code: 'InvalidMcpPayload', message: '`name` is required' },
      }
      return
    }

    try {
      const args = payload.arguments ?? {}
      const packageName =
        typeof args.package === 'string'
          ? encodeURIComponent(args.package)
          : undefined

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

      switch (payload.name) {
        case 'bundlephobia.size': {
          if (!packageName) {
            ctx.status = 400
            ctx.body = { error: { code: 'InvalidMcpPayload' } }
            return
          }
          ctx.body = await callLocalApi(`/api/size?package=${packageName}`)
          return
        }
        case 'bundlephobia.exports': {
          if (!packageName) {
            ctx.status = 400
            ctx.body = { error: { code: 'InvalidMcpPayload' } }
            return
          }
          ctx.body = await callLocalApi(`/api/exports?package=${packageName}`)
          return
        }
        case 'bundlephobia.exportsSizes': {
          if (!packageName) {
            ctx.status = 400
            ctx.body = { error: { code: 'InvalidMcpPayload' } }
            return
          }
          ctx.body = await callLocalApi(
            `/api/exports-sizes?package=${packageName}`
          )
          return
        }
        case 'bundlephobia.packageHistory': {
          if (!packageName) {
            ctx.status = 400
            ctx.body = { error: { code: 'InvalidMcpPayload' } }
            return
          }
          const limit = Number(args.limit ?? 10)
          ctx.body = await callLocalApi(
            `/api/package-history?package=${packageName}&limit=${limit}`
          )
          return
        }
        case 'bundlephobia.similarPackages': {
          if (!packageName) {
            ctx.status = 400
            ctx.body = { error: { code: 'InvalidMcpPayload' } }
            return
          }
          ctx.body = await callLocalApi(
            `/api/similar-packages?package=${packageName}`
          )
          return
        }
        default:
          break
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
    async (ctx, next) => {
      try {
        const { stdout, stderr } = await exec.command('pm2 reload all')
        ctx.body = 'Server restarted' + stdout
      } catch (err) {
        console.error('Failed to restart', err)
        ctx.status = 500
        ctx.body = err
      }
    }
  )

  router.post('/admin/restart', async ctx => {
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
    async (ctx, next) => {
      try {
        const { stdout } = await exec.command(
          'rm -rf /tmp/tmp-build/cache/_cacache /tmp/tmp-build/packages/'
        )
        ctx.body = 'Cache cleared' + stdout
      } catch (err) {
        console.error('Failed to clear cache', err)
        ctx.status = 500
        ctx.body = err
      }
    }
  )

  router.get('/result', async ctx => {
    invariant(ctx.query.p, 'p parameter is required')
    const packageString =
      typeof ctx.query.p === 'string' ? ctx.query.p : ctx.query.p.join('/')

    ctx.redirect(`/package/${packageString.trim()}`)
    ctx.status = 301
  })

  router.get('(.*)', async ctx => {
    invariant(ctx.req.url, 'url is missing')
    const parsedUrl = parse(ctx.req.url, true)
    await handle(ctx.req, ctx.res, parsedUrl)
    ctx.respond = false
  })

  server.use(async (ctx, next) => {
    ctx.res.statusCode = 200
    await next()
  })

  server.use(router.routes())
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
