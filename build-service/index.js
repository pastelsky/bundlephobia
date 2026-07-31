import 'dotenv-defaults/config.js'
import Fastify from 'fastify'
import {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
  eventQueue,
} from 'package-build-stats'
import Amplitude from '@amplitude/node'
import serializeError from './serializeError.js'

const fastify = Fastify()

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
    const result = await getPackageStats(packageString, {
      installTimeout: 60000,
    })
    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getPackageExportSizes(packageString, {
      installTimeout: 60000,
    })
    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getAllPackageExports(packageString, {
      installTimeout: 60000,
    })
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
