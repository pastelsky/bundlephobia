require('dotenv-defaults').config()
const next = require('next')
const exec = require('execa')

const Koa = require('koa')
const proxy = require('koa-proxy')
const serve = require('koa-static')
const koaCache = require('koa-cash')
const Router = require('koa-router')
const compress = require('koa-compress')
const cacheControl = require('koa-cache-control')
const requestId = require('koa-requestid')
const auth = require('koa-basic-auth')
const bodyParser = require('koa-bodyparser')
const Cache = require('./utils/cache.utils')
const { parsePackageString } = require('./utils/common.utils')
const firebaseUtils = require('./utils/firebase.utils')
const logger = require('./server/Logger')

const limit = require('./server/middlewares/rateLimit.middleware')
const exportsMiddlware = require('./server/middlewares/exports.middleware')
const exportsSizesMiddlware = require('./server/middlewares/exportsSizes.middleware')
const resolvePackageMiddleware = require('./server/middlewares/results/resolvePackage.middleware')
const cachedResponseMiddleware = require('./server/middlewares/results/cachedResponse.middleware')
const buildMiddleware = require('./server/middlewares/results/build.middleware')
const errorMiddleware = require('./server/middlewares/results/error.middleware')
const blockBlacklistMiddleware = require('./server/middlewares/results/blockBlacklist.middleware')
const requestLoggerMiddleware = require('./server/middlewares/requestLogger.middleware')
const similarPackagesMiddleware = require('./server/middlewares/similar-packages/similarPackages.middleware')
const generateImgMiddleware = require('./server/middlewares/generateImg.middleware')
const jsonCacheMiddleware = require('./server/middlewares/jsonCache.middleware')

const config = require('./server/config')

const cache = new Cache()
const port = parseInt(process.env.PORT) || config.DEFAULT_DEV_PORT
const dev = process.env.NODE_ENV !== 'production'
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
        max: 60,
      })
    )
  }

  server.use(async (ctx, next) => {
    try {
      await next()
    } catch (err) {
      if (401 == err.status) {
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
      flush: require('zlib').Z_SYNC_FLUSH,
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

  router.get(
    '/api/size',
    jsonCacheMiddleware({
      get: key => cache.getPackageSize(key),
      set: (key, value) => cache.setPackageSize(key, value),
      hash: ctx => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    errorMiddleware,
    resolvePackageMiddleware,
    blockBlacklistMiddleware,
    cachedResponseMiddleware,
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
      get: key => cache.getExportsSize(key),
      set: (key, value) => cache.setExportsSize(key, value),
      hash: ctx => ({
        name: ctx.state.resolved.name,
        version: ctx.state.resolved.version,
      }),
    }),
    errorMiddleware,
    resolvePackageMiddleware,
    blockBlacklistMiddleware,
    cachedResponseMiddleware,
    exportsSizesMiddlware
  )

  router.get('/api/recent', async ctx => {
    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.RECENTS_API,
      }
      ctx.body = await firebaseUtils.getRecentSearches(ctx.query.limit)
    } catch (err) {
      console.error('in /api/recent', err)
      logger.error('RECENT', err, 'RECENT FAILED: failed')
      ctx.status = 422
      ctx.body = { type: err.name, message: err.message }
    }
  })

  router.get('/api/package-history', async ctx => {
    const { name } = parsePackageString(ctx.query.package)
    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.PACKAGE_HISTORY_API,
      }
      ctx.body = await firebaseUtils.getPackageHistory(name, ctx.query.limit)
    } catch (err) {
      console.error(err)
      logger.error(
        'HISTORY',
        err,
        'HISTORY FAILED: for package' + ctx.query.package
      )
      ctx.status = 422
      ctx.body = { type: err.name, message: err.message }
    }
  })

  router.get('/api/similar-packages', similarPackagesMiddleware)

  router.get('/api/stats-image', generateImgMiddleware)

  router.get(
    '/admin/restart',
    auth({ name: 'bundlephobia', pass: process.env.BASIC_AUTH_PASSWORD }),
    async (ctx, next) => {
      try {
        const { stdout, stderr } = await exec.shell('pm2 reload all')
        ctx.body = 'Server restarted' + stdout
      } catch (err) {
        console.error('Failed to restart', err)
        ctx.status = 500
        ctx.body = err
      }
    }
  )

  router.post('/admin/restart', async (ctx, next) => {
    console.log('got', ctx.request.body)
    const { name, pass } = ctx.request.body
    if (name !== 'bundlephobia' || pass !== process.env.BASIC_AUTH_PASSWORD) {
      console.error('Failed to restart')
      ctx.status = 500
      ctx.body = 'Failed to restart'
    } else {
      const { stdout, stderr } = await exec.shell('pm2 reload all')
      ctx.body = 'Server restarted' + stdout
      console.error(stderr)
    }
  })

  router.get(
    '/admin/clear-cache',
    auth({ name: 'bundlephobia', pass: process.env.BASIC_AUTH_PASSWORD }),
    async (ctx, next) => {
      try {
        const { stdout } = await exec.shell(
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

  router.get('*', async ctx => {
    await handle(ctx.req, ctx.res)
    ctx.respond = false
  })

  server.use(async (ctx, next) => {
    ctx.res.statusCode = 200
    await next()
  })

  server.use(router.routes())
  server.listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
