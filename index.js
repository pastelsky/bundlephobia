require('dotenv').config()
const opbeat = require('opbeat').start({
  active: process.env.NODE_ENV === 'production',
  loglevel: 'warning',
})
const next = require('next')
const fetch = require('node-fetch')
const firebase = require('firebase')
const workerpool = require('workerpool')
const debug = require('debug')('bp:request')
const { TimeoutError } = require('workerpool/lib/Promise')

const Koa = require('koa')
const cors = require('kcors')
const serve = require('koa-static')
const koaCache = require('koa-cash')
const Router = require('koa-router')
const compress = require('koa-compress')
const cacheControl = require('koa-cache-control')

const Cache = require('./utils/cache.utils')
const { parsePackageString } = require('./utils/common.utils')
const FirebaseUtils = require('./utils/firebase.utils')
const { resolvePackage } = require('./utils/server.utils')
const CustomError = require('./server/CustomError')

const config = require('./server/config')

const pool = workerpool.pool(__dirname + '/server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
});

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

const cache = new Cache(firebase)
const firebaseUtils = new FirebaseUtils(firebase)
const port = parseInt(process.env.PORT) || config.DEFAULT_DEV_PORT
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
  .then(() => {
    const server = new Koa()
    const router = new Router()

    server.use(cacheControl())
    server.use(cors())

    server.use(compress({
      filter: function (contentType) {
        return /(text|json|javascript|svg)/.test(contentType)
      },
      threshold: 2048,
      flush: require('zlib').Z_SYNC_FLUSH,
    }))


    server.use(serve('./assets/public'))

    server.use(koaCache({
      async get(key) {
        // Emulate koa-cash cache value
        const value = await cache.get(key)
        return {
          body: value,
          type: 'application/json',
        }
      },
      set(key, value) {
        // We only need the body part from what
        // koa-cash gives us
        cache.set(key, JSON.parse(value.body))
      },
      hash(ctx) {
        return ctx.state.package
      },
    }))

    router.get('/api/size', async ctx => {
        const {
          package: packageString,
          record,
          force,
        } = ctx.query
        debug('Package %s', packageString)

        try {
          const { scoped, name, version } = await resolvePackage(parsePackageString(packageString))

          ctx.state.package = { name, version }
          debug('resolved to %s@%s', name, version)

          if (!force) {
            const isCached = await ctx.cashed()
            if (isCached) {
              firebaseUtils.setRecentSearch(name, { name, version })
              return
            }
          }

          let result

          if (process.env.AWS_LAMBDA_ENDPOINT) {
            result = await fetch(`${process.env.AWS_LAMBDA_ENDPOINT}/size?p=${encodeURIComponent(packageString)}`)
              .then(async res => {
                if (!res.ok) {
                  throw new CustomError('BuildError', await res.json())
                } else {
                  return res.json()
                }
              })
          } else {
            result = await pool.exec('getPackageStats', [packageString, name])
              .timeout(config.WORKER_TIMEOUT)
            pool.clear()
          }

          ctx.body = { scoped, name, version, ...result }

          if (record === 'true') {
            firebaseUtils.setRecentSearch(name, { name, version })
          }
        } catch (err) {
          opbeat.captureError(err, { request: ctx.req })
          console.error(err)

          if (err instanceof TimeoutError) {
            ctx.status = 503
            ctx.body = {
              error: {
                code: 'TimeoutError',
                message: `The package took more than ${config.WORKER_TIMEOUT / 1000}s to build and was aborted. This can happen if the package is very large and / or if the server is under heavy load.`,
              },
            }
            return
          }

          if (!('name' in err)) {
            ctx.status = 500
            ctx.body = {
              error: { code: 'UnkownError', message: '', details: err },
            }
            return
          }

          switch (err.name) {
            case 'PackageNotFoundError':
              ctx.status = 404
              ctx.body = {
                error: {
                  code: 'PackageNotFoundError',
                  message: 'The package you were looking for doesn\'t exist.',
                  details: {},
                },
              }
              break

            case 'InstallError':
              ctx.status = 500
              ctx.body = {
                error: {
                  code: 'InstallError',
                  message: 'Installing the packaged failed.',
                  details: {},
                },
              }
              break

            case 'EntryPointError':
              ctx.status = 500
              ctx.body = {
                error: {
                  code: 'EntryPointError',
                  message: 'We had trouble building the package',
                  details: {},
                },
              }
              break

            case 'MissingDependencyError':
              ctx.status = 500
              ctx.body = {
                error: {
                  code: 'MissingDependencyError',
                  message: `Package uses <code>\`${err.extra.missingModule}\`</code>, ` +
                  'but does not specify it<br /> either as a dependency or a peer dependency',
                  details: err,
                },
              }
              break

            case 'BuildError':
            default:
              ctx.status = 500
              ctx.body = {
                error: {
                  code: 'BuildError',
                  message: 'Failed to build this package.',
                  details: err,
                },
              }
              break
          }
        }
      },
    )

    router.get('/api/recent', async (ctx) => {
      ctx.cacheControl = {
        maxAge: 15,
      }

      try {
        ctx.body = await firebaseUtils
          .getRecentSearches(Number(ctx.query.limit))
      } catch (err) {
        opbeat.captureError(err)
        ctx.status = 422
        ctx.body = { type: err.name, message: err.message }
      }
    })

    router.get('/api/package-history', async (ctx) => {
      const { name } = parsePackageString(ctx.query.package)
      try {
        ctx.body = await firebaseUtils.getPackageHistory(name)
      } catch (err) {
        opbeat.captureError(err)
        ctx.status = 422
        ctx.body = { type: err.name, message: err.message }
      }
    })

    router.get('*', async ctx => {
      await handle(ctx.req, ctx.res)
      ctx.respond = false
    })

    server.use(async (ctx, next) => {
      ctx.res.statusCode = 200
      await next()
    })

    server.use(router.routes())
    server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })