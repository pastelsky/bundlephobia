import 'dotenv-defaults/config.js'
import Fastify from 'fastify'
import Amplitude from '@amplitude/node'
import serializeError from './serializeError.js'
import runPackageOperation, {
  BuildOperationCancelledError,
} from './runPackageOperation.js'

const fastify = Fastify()
let amplitudeClient

if (process.env.AMPLITUDE_API_KEY) {
  amplitudeClient = Amplitude.init(process.env.AMPLITUDE_API_KEY)

  setInterval(() => {
    amplitudeClient.flush()
  }, 5000)
}

function recordTelemetry(event, details) {
  amplitudeClient?.logEvent({
    event_type: event,
    user_id: 'build-service',
    event_properties: { ...details },
  })
}

async function handleBuild(operation, packageString, res) {
  const abortController = new AbortController()
  const cancelDisconnectedBuild = () => {
    if (!res.raw.writableEnded) {
      abortController.abort()
    }
  }
  res.raw.once('close', cancelDisconnectedBuild)

  try {
    const result = await runPackageOperation(operation, packageString, {
      signal: abortController.signal,
      onTelemetry: recordTelemetry,
    })
    return res.code(200).send(result)
  } catch (err) {
    if (err instanceof BuildOperationCancelledError) {
      return
    }
    console.log(err)
    return res.code(500).send(serializeError(err))
  } finally {
    res.raw.removeListener('close', cancelDisconnectedBuild)
  }
}

fastify.get('/size', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)
  return handleBuild('size', packageString, res)
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  return handleBuild('exportSizes', packageString, res)
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  return handleBuild('exports', packageString, res)
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
