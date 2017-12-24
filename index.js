require('dotenv').config()
const next = require('next')
const semver = require('semver')
const axios = require('axios')
const firebase = require('firebase')
const limit = require('./server/rate-limit-middleware')
const workerpool = require('workerpool')
const now = require('performance-now')
const arrayToSentence = require('array-to-sentence')
const debug = require('debug')('bp:request')
const Logger = require('le_node')

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

const log = new Logger({
  token: process.env.LOGENTRIES_TOKEN,
});

const config = require('./server/config')

const pool = workerpool.pool(`${__dirname}/server/worker.js`, {
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
  SIZE_API_ERROR: dev ? 0 : 60 * 5,
  SIZE_API_ERROR_FATAL: dev ? 0 : 60 * 60,
  SIZE_API_HAS_VERSION: dev ? 0 : 12 * 60 * 60,
}

app.prepare().then(() => {
  const server = new Koa()
  const router = new Router()

  server.use(cacheControl())
  server.use(cors())

  if (!dev) {
    server.use(limit({
      duration: 1000 * 60 * 1, // 1 min
      max: 25,
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
      console.log('settting value', value)
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
      log.info({ type: 'SIZE_SEARCH', string: packageString })

      const parsedPackage = parsePackageString(packageString)
      let resolvedPackage

      try {
        const resolveStartTime = now()
        resolvedPackage = await resolvePackage(parsedPackage)
        const { scoped, name, version } = resolvedPackage

        ctx.state.package = { name, version }
        debug('resolved to %s@%s', name, version)
        log.info({ type: 'RESOLVE_TIME', value: now() - resolveStartTime })

        if (!force) {
          const cacheFetchStart = now()
          const isCached = await ctx.cashed()
          if (isCached) {
            log.info({ type: 'CACHE_HIT_TIME', value: now() - cacheFetchStart })
            firebaseUtils.setRecentSearch(name, { name, version })
            return
          } else {
            log.info({ type: 'CACHE_MISS' })
          }

          const failureCacheEntry = failureCache.get(`${name}@${version}`)
          if (failureCacheEntry) {
            log.info({ type: 'FAILURE_CACHE_HIT', name, version })
            debug('fetched %s from failure cache', `${name}@${version}`)

            ctx.status = failureCacheEntry.status
            ctx.body = failureCacheEntry.body
            return
          }
        }

        let result

        const buildStartTime = now()
        if (process.env.BUILD_SERVICE_ENDPOINT) {
          try {
            const response = await axios.get(`${process.env.BUILD_SERVICE_ENDPOINT}/size?p=${encodeURIComponent(packageString)}`)
              result = response.data
          } catch (error) {
            const contents = error.response.data
            throw new CustomError(contents.name || 'BuildError', contents.originalError, contents.extra)
          }
        } else {
          result = await pool.exec('getPackageStats', [packageString, name])
            .timeout(config.WORKER_TIMEOUT)
          pool.clear()
        }
        log.info({
          type: 'BUILD_TIME',
          time: now() - buildStartTime,
          name, version,
        })

        ctx.cacheControl = {
          maxAge: force ? 0 : semver.valid(parsedPackage.version) ?
            CACHE_CONFIG.SIZE_API_HAS_VERSION : CACHE_CONFIG.SIZE_API_DEFAULT,
        }

        ctx.body = { scoped, name, version, ...result }

        if (record === 'true') {
          firebaseUtils.setRecentSearch(name, { name, version })
        }
      } catch (err) {
        console.error(err)
        log.err({
          type: 'ERROR',
          errorType: err.name,
          name: parsedPackage.name,
          version: parsedPackage.version,
          details: err,
        })

        ctx.cacheControl = {
          maxAge: force ? 0 : CACHE_CONFIG.SIZE_API_ERROR,
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

          case 'PackageVersionMismatchError': {
            const validVersions = arrayToSentence(
              err.extra
                .validVersions
                .map(version => `\`<code>${version}</code>\``),
            )

            ctx.status = 404
            ctx.body = {
              error: {
                code: 'PackageVersionMismatchError',
                message: `This package has not been published with this particular version. 
                Valid versions - ${validVersions}`,
                details: {},
              },
            }
            break
          }

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
                message: 'We could not guess a valid entry point for this package. ' +
                'Perhaps the author hasn\'t specified one in its package.json ?',
                details: {},
              },
            }
            break

          case 'MissingDependencyError': {
            const status = 500
            ctx.cacheControl = {
              maxAge: force ? 0 : CACHE_CONFIG.SIZE_API_ERROR_FATAL,
            }

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

            debug('saved %s to failure cache', `${resolvedPackage.name}@${resolvedPackage.version}`)
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

            debug('saved %s to failure cache', `${resolvedPackage.name}@${resolvedPackage.version}`)
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
      console.error(err)
      log.err({ type: 'RECENT_API_ERROR', details: err })
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
      console.error(err)
      log.err({ type: 'HISTORY_API_ERROR', details: err })
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
