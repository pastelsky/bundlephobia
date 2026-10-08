import 'dotenv-defaults/config.js'
import Fastify from 'fastify'
import {
  getPackageStats,
  getPackageExportSizes,
  getAllPackageExports as getPackageExports,
  getPackageEntryPoints,
  eventQueue,
} from 'package-build-stats'
import Amplitude from '@amplitude/node'
import serializeError from './serializeError.js'
import { measureBuild } from './metrics.js'
import { createInstallationProvider } from './installationProvider.ts'
import { activeBuilds, recordBuildPhase } from './buildMemoryTrace.ts'
import memoryDiagnostics from '../scripts/memory-diagnostics.cjs'
import {
  normalizeEntryPoint,
  packageEntryPointSchema,
  ENTRY_POINT_HEADER,
} from '@bundlephobia/service-contracts/package'

const fastify = Fastify()

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
    return await analyze(req.query.p, {
      entryPoint: normalizeEntryPoint(req.query.entryPoint),
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

const operations = {
  size: getPackageStats,
  exports: getPackageExports,
  'exports-sizes': getPackageExportSizes,
  'entry-points': getPackageEntryPoints,
}

for (const [operation, analyze] of Object.entries(operations)) {
  fastify.get(
    `/${operation}`,
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['p'],
          properties: {
            p: { type: 'string', minLength: 1 },
            entryPoint: { type: 'string' },
          },
        },
      },
    },
    async (req, res) => {
      const parsed = packageEntryPointSchema
        .optional()
        .safeParse(req.query.entryPoint)

      if (
        !parsed.success ||
        (operation === 'entry-points' && normalizeEntryPoint(parsed.data))
      ) {
        return res.code(400).send({ error: 'Invalid entryPoint' })
      }

      const packageString = req.query.p

      try {
        const result = await measureBuild({
          operation,
          packageString,
          run: () => analyzePackage(req, res, analyze),
        })

        res.header(
          ENTRY_POINT_HEADER,
          encodeURIComponent(normalizeEntryPoint(parsed.data) ?? '.'),
        )

        return res.code(200).send(result)
      } catch (err) {
        return sendBuildError(res, packageString, err)
      }
    },
  )
}

fastify
  .listen({ port: 7002 })
  .then(() => {
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
