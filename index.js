require('dotenv').config()
const opbeat = require('opbeat').start({
  active: process.env.NODE_ENV === 'production',
  loglevel: 'warning',
})
const next = require('next')
const semver = require('semver')
const fetch = require('node-fetch')
const firebase = require('firebase')
const limit = require('./server/rate-limit-middleware')
const workerpool = require('workerpool')
const arrayToSentence = require('array-to-sentence')
const debug = require('debug')('bp:request')
const { TimeoutError } = require('workerpool/lib/Promise')

const Koa = require('koa')
const cors = require('kcors')
const proxy = require('koa-proxy')
const serve = require('koa-static')
const koaCache = require('koa-cash')
const Router = require('koa-router')
const compress = require('koa-compress')
const cacheControl = require('koa-cache-control')
const LRU = require('lru-cache')

const Cache = require('./utils/cache.utils')
const { parsePackageString } = require('./utils/common.utils')
const FirebaseUtils = require('./utils/firebase.utils')
const { resolvePackage } = require('./utils/server.utils')
const CustomError = require('./server/CustomError')

const config = require('./server/config')

const pool = workerpool.pool(__dirname + '/server/worker.js', {
  maxWorkers: config.MAX_WORKERS,
});

if (process.env.FIREBASE_DATABASE_URL) {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  }

  firebase.initializeApp(firebaseConfig)
}

const failureCache = LRU({
  max: config.MAX_FAILURE_CACHE_ENTRIES,
  maxAge: 6 * 1000 * 60 * 60,
})

const cache = new Cache(firebase)
const firebaseUtils = new FirebaseUtils(firebase, !!process.env.FIREBASE_DATABASE_URL)
const port = parseInt(process.env.PORT) || config.DEFAULT_DEV_PORT
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const CACHE_CONFIG = {
  PUBLIC_ASSETS: dev ? 0 : 24 * 60 * 60,
  RECENTS_API: dev ? 0 : 20 * 60,
  PACKAGE_HISTORY_API: dev ? 0 : 60 * 60,
  SIZE_API_DEFAULT: dev ? 0 : 60 * 2,
  SIZE_API_TIMEOUT: dev ? 0 : 60 * 30,
  SIZE_API_HAS_VERSION: dev ? 0 : 12 * 60 * 60,
}

app.prepare()
  .then(() => {
    const server = new Koa()
    const router = new Router()

    server.use(cacheControl())

    server.use(cors())

    if (!dev) {
      server.use(limit({
        duration: 1000 * 60 * 3, // 3 mins
        max: 35,
        //blackList: ['127.0.0.1']
      }));
    }

    server.use(compress({
      filter: function (contentType) {
        return /(text|json|javascript|svg)/.test(contentType)
      },
      threshold: 2048,
      flush: require('zlib').Z_SYNC_FLUSH,
    }))

    server.use(serve('./assets/public', {
      maxage: CACHE_CONFIG.PUBLIC_ASSETS * 1000,
    }))

    server.use(proxy({
      match: /^\/-\/search/,
      host: 'https://www.npmjs.com',
    }));

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

        const parsedPackage = parsePackageString(packageString)
        let resolvedPackage

        try {
          resolvedPackage = await resolvePackage(parsedPackage)
          const { scoped, name, version } = resolvedPackage

          ctx.state.package = { name, version }
          debug('resolved to %s@%s', name, version)

          if (!force) {
            const isCached = await ctx.cashed()
            if (isCached) {
              firebaseUtils.setRecentSearch(name, { name, version })
              return
            }

            const failureCacheEntry = failureCache.get(`${name}@${version}`)
            if (failureCacheEntry) {
              debug('fetched %s from failure cache', `${name}@${version}`)
              ctx.status = failureCacheEntry.status
              ctx.body = failureCacheEntry.body
              return
            }
          }

          let result

          if (process.env.AWS_LAMBDA_ENDPOINT) {
            result = await fetch(`${process.env.AWS_LAMBDA_ENDPOINT}/size?p=${encodeURIComponent(packageString)}`)
              .then(async res => {
                if (!res.ok) {
                  if (res.status === 504) { // Gateway timeout error
                    throw new TimeoutError()
                  } else {
                    const error = await res.json()
                    throw new CustomError(error.name || 'BuildError', error.originalError, error.extra)
                  }
                } else {
                  return res.json()
                }
              })
          } else {
            result = await pool.exec('getPackageStats', [packageString, name])
              .timeout(config.WORKER_TIMEOUT)
            pool.clear()
          }

          ctx.cacheControl = {
            maxAge: semver.valid(parsedPackage.version) ?
              CACHE_CONFIG.SIZE_API_HAS_VERSION :
              (force ? 0 : CACHE_CONFIG.SIZE_API_DEFAULT),
          }

          ctx.body = { scoped, name, version, ...result }

          if (record === 'true') {
            firebaseUtils.setRecentSearch(name, { name, version })
          }
        } catch (err) {
          opbeat.captureError(err, { request: ctx.req })
          console.error(err)

          ctx.cacheControl = {
            maxAge: force ? 0 : CACHE_CONFIG.SIZE_API_DEFAULT,
          }

          if (err instanceof TimeoutError) {
            ctx.status = 503
            ctx.cacheControl = {
              maxAge: force ? 0 : CACHE_CONFIG.SIZE_API_TIMEOUT,
            }
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
              // Installing can fail for various reasons,
              // let's not cache this since it will
              // likely be resolved on a retry
              ctx.cacheControl = {
                maxAge: 0,
              }
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

            case 'MissingDependencyError': {
              const status = 500

              const missingModules = arrayToSentence(
                err.extra
                  .missingModules
                  .map(module => `\`<code>${module}</code>\``),
              )

              const body = {
                error: {
                  code: 'MissingDependencyError',
                  message: `This package (or this version) uses ${missingModules}, ` +
                  `but does not specify ${missingModules.length > 1 ? 'them' :
                    'it' }<br /> either as a dependency or a peer dependency`,
                  details: err,
                },
              }

              ctx.status = status
              ctx.body = body

              debug('saved %s to failure cache', `${name}@${version}`)
              failureCache.set(
                `${resolvedPackage.name}@${resolvedPackage.version}`,
                { status, body },
              )
              break
            }

            case 'BuildError':
            default: {
              const status = 500
              const body = {
                error: {
                  code: 'BuildError',
                  message: 'Failed to build this package.',
                  details: err,
                },
              }

              ctx.status = status
              ctx.body = body

              debug('saved %s to failure cache', `${name}@${version}`)
              failureCache.set(
                `${resolvedPackage.name}@${resolvedPackage.version}`,
                { status, body },
              )
              break
            }
          }
        }
      },
    )

    router.get('/api/recent', async (ctx) => {
      try {
        ctx.cacheControl = {
          maxAge: CACHE_CONFIG.RECENTS_API,
        }
        ctx.body = await firebaseUtils
          .getRecentSearches(ctx.query.limit)
      } catch (err) {
        opbeat.captureError(err)
        ctx.status = 422
        ctx.body = { type: err.name, message: err.message }
      }
    })

    router.get('/api/package-history', async (ctx) => {
      const { name } = parsePackageString(ctx.query.package)
      try {
        ctx.cacheControl = {
          maxAge: CACHE_CONFIG.PACKAGE_HISTORY_API,
        }
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