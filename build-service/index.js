import 'dotenv-defaults/config.js'
import Fastify from 'fastify'
import {
  getPackageStats,
  getPackageExportSizes,
  getAllPackageExports as getPackageExports,
  eventQueue,
} from 'package-build-stats'
import Amplitude from '@amplitude/node'
import serializeError from './serializeError.js'
import { measureBuild } from './metrics.js'
import { createInstallationProvider } from './installationProvider.ts'
import { activeBuilds, recordBuildPhase } from './buildMemoryTrace.ts'
import memoryDiagnostics from '../scripts/memory-diagnostics.cjs'

const fastify = Fastify()

if (memoryDiagnostics.enabled) {
  memoryDiagnostics.registerMetricsProvider('builds', () => ({
    active: activeBuilds(),
  }))
  eventQueue.on('*', recordBuildPhase)
}

const installationProvider = process.env.INSTALLATION_SERVICE_ENDPOINT
  ? createInstallationProvider(process.env.INSTALLATION_SERVICE_ENDPOINT)
  : undefined

let runningAnalyses = 0

async function analyzePackage(req, res, analyze) {
  // Three PM2 workers each own one slot until analysis and cleanup settle.
  if (runningAnalyses >= 1) {
    throw Object.assign(new Error('This build worker is busy'), {
      code: 'BUILD_SERVICE_BUSY',
    })
  }

  runningAnalyses += 1
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 10 * 60_000)
  req.raw.once('aborted', abort)
  res.raw.once('close', abort)

  try {
    if (req.raw.aborted || res.raw.destroyed) abort()
    controller.signal.throwIfAborted()

    return await analyze(decodeURIComponent(req.query.p), {
      installTimeout: 60000,
      installationProvider,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
    req.raw.off('aborted', abort)
    res.raw.off('close', abort)
    runningAnalyses -= 1
  }
}

function sendBuildError(res, packageString, error) {
  if (error?.code === 'BUILD_SERVICE_BUSY') {
    return res
      .code(503)
      .header('Retry-After', '1')
      .send({
        name: 'BuildServiceBusyError',
        originalError: error.message,
        extra: { retryable: true },
      })
  }

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
    const result = await measureBuild({
      operation: 'size',
      packageString,
      run: () => analyzePackage(req, res, getPackageStats),
    })

    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await measureBuild({
      operation: 'exports-sizes',
      packageString,
      run: () => analyzePackage(req, res, getPackageExportSizes),
    })

    return res.code(200).send(result)
  } catch (err) {
    return sendBuildError(res, packageString, err)
  }
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await measureBuild({
      operation: 'exports',
      packageString,
      run: () => analyzePackage(req, res, getPackageExports),
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
