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
import { measureBuild as measureBuildDiagnostics } from './metrics.js'
import { createOutcomeMetrics } from '../observability/outcomeMetrics.ts'
import { createInstallationProvider } from './installationProvider.ts'
import { activeBuilds, recordBuildPhase } from './buildMemoryTrace.ts'
import memoryDiagnostics from '../scripts/memory-diagnostics.cjs'

const fastify = Fastify()

const outcomes = createOutcomeMetrics('bundlephobia_builds_total', [
  'size',
  'exports-sizes',
  'exports',
])

function measureBuild(options) {
  return outcomes.measure(options.operation, () =>
    measureBuildDiagnostics(options),
  )
}

// PM2 workers share the job port. Scraping it would randomly switch counters
// between workers, so each existing worker exposes a private port. During a rolling reload, old/new workers
// for the same instance can temporarily share that port through Node cluster.
if (process.env.BUILD_METRICS_BASE_PORT) {
  const metrics = Fastify()
  metrics.get('/metrics', async (_request, reply) =>
    reply
      .type(outcomes.registry.contentType)
      .send(await outcomes.registry.metrics()),
  )

  const port =
    Number(process.env.BUILD_METRICS_BASE_PORT) +
    Number(process.env.NODE_APP_INSTANCE ?? 0)

  await metrics.listen({ host: '127.0.0.1', port }).catch(error => {
    console.error('Build metrics endpoint unavailable', error)
  })
  fastify.addHook('onClose', async () => metrics.close())
}

memoryDiagnostics.registerMetricsProvider('builds', () => ({
  active: activeBuilds(),
}))

eventQueue.on('*', recordBuildPhase)

const installationProvider = process.env.INSTALLATION_SERVICE_ENDPOINT
  ? createInstallationProvider(process.env.INSTALLATION_SERVICE_ENDPOINT)
  : undefined

async function analyzePackage(req, res, analyze) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 10 * 60_000)
  req.raw.once('aborted', abort)
  res.raw.once('close', abort)

  try {
    return await analyze(decodeURIComponent(req.query.p), {
      installTimeout: 60000,
      installationProvider,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
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
