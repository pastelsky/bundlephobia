import 'dotenv-defaults/config'

import { monitorEventLoopDelay } from 'node:perf_hooks'

import next from 'next'
import Koa from 'koa'
import proxy from 'koa-proxy'
import serve from 'koa-static'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import cacheControl from 'koa-cache-control'
import requestId from 'koa-requestid'
import invariant from 'ts-invariant'

import CacheServiceClient from './clients/cache-service.client'
import config from './config/server.config'
import logger from './infrastructure/logger.service'
import { apiDiscoveryMiddleware } from './middlewares/api-discovery.middleware'
import { registerAdminRoutes } from './routes/admin.route'
import { registerApiRoutes } from './routes/api.route'
import { registerSystemRoutes } from './routes/system.route'
import requestLoggerMiddleware from './middlewares/request-logger.middleware'
import limit from './middlewares/rate-limit.middleware'

interface ServerEnvironment {
  basicAuthPassword: string
  nodeEnv: string
  port: number
}

function getEnvironment(
  environment: Record<string, string | undefined | null>,
): ServerEnvironment {
  invariant(
    environment.BASIC_AUTH_PASSWORD,
    'Environment variable BASIC_AUTH_PASSWORD is required',
  )
  invariant(environment.NODE_ENV, 'Environment variable NODE_ENV is required')

  return {
    basicAuthPassword: environment.BASIC_AUTH_PASSWORD,
    nodeEnv: environment.NODE_ENV,
    port: environment.PORT
      ? parseInt(environment.PORT)
      : config.DEFAULT_DEV_PORT,
  }
}

function startEventLoopMonitoring(): void {
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
}

export async function startServer(): Promise<void> {
  const environment = getEnvironment(process.env)
  const cache = new CacheServiceClient()
  const dev = environment.nodeEnv !== 'production'
  const app = next({ dev })
  const handle = app.getRequestHandler()

  startEventLoopMonitoring()
  await app.prepare()

  const server = new Koa()
  const router = new Router()

  server.use(requestId())
  server.use(bodyParser())
  server.use(requestLoggerMiddleware)
  server.use(cacheControl())
  server.use(apiDiscoveryMiddleware)

  if (!dev) {
    server.use(
      limit({
        duration: 1000 * 60 * 5,
        max: 120,
        whiteList: ['127.0.0.1', '::1'],
      }),
    )
  }

  server.use(async (ctx, nextMiddleware) => {
    try {
      await nextMiddleware()
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        ctx.status = 401
        ctx.set('WWW-Authenticate', 'Basic')
        ctx.body = 'Permission denied'
      } else {
        throw error
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

  registerApiRoutes(router, { cache, port: environment.port })
  registerAdminRoutes(router, environment.basicAuthPassword)
  registerSystemRoutes(router, handle)

  server.use(async (ctx, nextMiddleware) => {
    ctx.res.statusCode = 200
    await nextMiddleware()
  })

  server.use(router.routes())
  server.listen(environment.port, () => {
    console.log(`> Ready on http://localhost:${environment.port}`)
  })
}
