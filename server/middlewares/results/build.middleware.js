const axios = require('axios')
const Queue = require('./../../Queue')
const { requestQueue, pool  } = require('../../init')
const semver = require('semver')
const CONFIG = require('../../config')
const firebaseUtils = require('../../../utils/firebase.utils')
const CustomError = require('../../CustomError')
const debug = require('debug')('bp:build')
const now = require('performance-now')
const logger = require('../../Logger')
const Cache = require('../../../utils/cache.utils')

const cache = new Cache()

requestQueue.setExecutor(async ({packageString, name}) => {
  if (process.env.BUILD_SERVICE_ENDPOINT) {
    try {
      const response = await axios.get(`${process.env.BUILD_SERVICE_ENDPOINT}/size?p=${encodeURIComponent(packageString)}`)
      return response.data
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const contents = error.response.data
        throw new CustomError(contents.name || 'BuildError', contents.originalError, contents.extra)
      } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        debug('No response received from build server. Is the server down?')
        throw new CustomError('BuildError', error.request)
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new CustomError('BuildError', error.message)
      }

    }
  } else {
    return await pool.exec('getPackageStats', [packageString, name])
      .timeout(CONFIG.WORKER_TIMEOUT)
  }
})

async function buildMiddleware(ctx, next) {
  let result, priority
  const client = ctx.headers['x-bundlephobia-user']
  const { scoped, name, version, description, repository, packageString } = ctx.state.resolved
  const { force, record } = ctx.query

  switch (client) {
    case 'bundlephobia website':
      priority = Queue.priority.HIGH
      break
    case 'yarn website':
      priority = Queue.priority.LOW
      // ctx.status = 503
      // ctx.body = {error: 'Service under maintenance'}
      // debug('Yarn traffic: Service under maintenance')
      // return
      break

    default:
      priority = Queue.priority.MEDIUM
  }

  const buildStart = now()
  result = await requestQueue.process(packageString, { packageString, name }, { priority })
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: force ? 0 : semver.valid(version) ?
      CONFIG.CACHE.SIZE_API_HAS_VERSION : CONFIG.CACHE.SIZE_API_DEFAULT,
  }

  const body = { scoped, name, version, description, repository, ...result }
  ctx.body = body
  ctx.state.buildResult = body
  const time =  buildEnd - buildStart;

  logger.info('BUILD', {
    result,
    requestId: ctx.state.id,
    time,
  }, `BUILD: ${packageString} built in ${time.toFixed()}s and is ${result.size} bytes`)

  if (record === 'true') {
    firebaseUtils.setRecentSearch(name, { name, version })
  }

  if (force === 'true') {
    cache.set({ name, version }, body)
  }
}

module.exports = buildMiddleware