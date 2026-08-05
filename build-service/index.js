import 'dotenv-defaults/config.js'
import Fastify from 'fastify'
import {
  getPackageStats,
  getPackageExportSizes,
  getPackageExports,
  eventQueue,
} from 'package-build-stats'
import Amplitude from '@amplitude/node'
import serializeError from './serializeError.js'

const fastify = Fastify()

async function analyzePackage(req, res, packageString, analyze) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  req.raw.once('aborted', abort)
  res.raw.once('close', abort)

  try {
    return await analyze(packageString, {
      installTimeout: 60000,
      installationService: process.env.INSTALLATION_SERVICE_ENDPOINT
        ? { url: process.env.INSTALLATION_SERVICE_ENDPOINT }
        : undefined,
      signal: controller.signal,
    })
  } finally {
    req.raw.off('aborted', abort)
    res.raw.off('close', abort)
  }
}

function sendBuildError(res, packageString, error) {
  const serialized = serializeError(error)
  console.error('PACKAGE_BUILD_FAILED', {
    packageString,
    name: serialized.name,
    originalError: serialized.originalError,
  })
  return res.code(500).send(serialized)
}

if (process.env.AMPLITUDE_API_KEY) {
  const client = Amplitude.init(process.env.AMPLITUDE_API_KEY)

  eventQueue.on('*', (event, details) => {
    client.logEvent({
      event_type: event,
      user_id: 'build-service',
      event_properties: {
        ...details,
      },
    })
  })

  setInterval(() => {
    client.flush()
  }, 5000)
}

fastify.get('/size', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)
  try {
    const result = await analyzePackage(
      req,
      res,
      packageString,
      getPackageStats
    )
    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await analyzePackage(
      req,
      res,
      packageString,
      getPackageExportSizes
    )
    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await analyzePackage(
      req,
      res,
      packageString,
      getPackageExports
    )
    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify
  .listen({ port: 7002 })
  .then(() => {
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
