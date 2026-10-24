import 'dotenv-defaults/config.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify, { type FastifyReply } from 'fastify'
import { z } from 'zod'
import { installPackage } from 'package-build-stats/installation'
import disposePackage from './disposeInstallation.ts'
import InstallationStore, { type InstallOptions } from './InstallationStore.ts'
import createInstallQueue from './createInstallQueue.ts'
import requestSignal from './requestSignal.ts'
import {
  resolveRegistryPackageSpec,
  UnsupportedRegistryPackageSpecError,
} from './resolveRegistryPackageSpec.ts'
import serializeError from '../build-service/serializeError.js'
import { createOutcomeMetrics } from '../server/infrastructure/outcome-metrics.mts'
import { registerQueueMetrics } from '../server/infrastructure/queue-metrics.mts'

const outcomes = createOutcomeMetrics(
  'bundlephobia_installs_total',
  ['install'],
  'bundlephobia_install_duration_seconds',
)

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const clientSchema = z.enum(['npm', 'yarn', 'pnpm', 'bun'])

const installOptionsSchema = z.object({
  client: z.union([clientSchema, z.array(clientSchema)]).optional(),
  limitConcurrency: z.boolean().optional(),
  networkConcurrency: z.number().optional(),
  additionalPackages: z.array(z.string()).default([]),
  installTimeout: z.number().int().positive().max(600_000).optional(),
  debug: z.boolean().optional(),
})

async function installPackageWithVersion(
  packageString: string,
  options: InstallOptions,
) {
  const installation = await installPackage(packageString, options)

  try {
    const packageJSON = JSON.parse(
      await fs.readFile(
        path.join(installation.packagePath, 'package.json'),
        'utf8',
      ),
    )

    const { version } = z.object({ version: z.string() }).parse(packageJSON)

    return { ...installation, packageVersion: version }
  } catch (error) {
    await disposePackage(installation)
    throw error
  }
}

const installQueue = createInstallQueue(
  positiveInteger(process.env.INSTALLATION_CONCURRENCY, 2),
)

registerQueueMetrics(outcomes.registry, 'installations', () =>
  installQueue.diagnostics(),
)

const store = new InstallationStore(
  {
    installPackage: installPackageWithVersion,
    disposePackage,
  },
  {
    // TASK_PACKAGE_INSTALL reports each package-manager fallback, before
    // version validation and metadata publication. Count the store completion
    // once so a Bun failure followed by npm success is one successful install.
    onInstallComplete: (outcome, seconds) =>
      outcomes.record('install', outcome, seconds),
    queue: installQueue,
    rootPath:
      process.env.INSTALLATION_ROOT_PATH || '/tmp/tmp-build/installations',
    retentionMs: positiveInteger(
      process.env.INSTALLATION_RETENTION_MS,
      3 * 60_000,
    ),
    leaseMs: positiveInteger(process.env.INSTALLATION_LEASE_MS, 15 * 60_000),
  },
)

await store.start()

const fastify = Fastify({ bodyLimit: 64 * 1024 })

function sendInstallationError(error: Error, reply: FastifyReply) {
  if (
    error instanceof UnsupportedRegistryPackageSpecError ||
    error instanceof z.ZodError
  ) {
    return reply.code(400).send({
      name: 'InstallError',
      originalError: error.message,
    })
  }

  const serialized = serializeError(error)

  const code = 'code' in error ? error.code : undefined

  const packageNotFound =
    serialized.name === 'PackageNotFoundError' ||
    code === 'E404' ||
    code === 'ETARGET'

  if (packageNotFound) serialized.name = 'PackageNotFoundError'

  return reply.code(packageNotFound ? 404 : 500).send(serialized)
}

fastify.post('/installations', async (request, reply) => {
  const signal = requestSignal(reply)

  const parsed = z
    .object({ packageString: z.string(), options: z.unknown().optional() })
    .safeParse(request.body)

  if (!parsed.success) {
    return reply.code(400).send({
      name: 'InstallError',
      originalError: 'packageString must be an npm registry package spec',
    })
  }

  try {
    const body = parsed.data
    // Resolve mutable tags/ranges immediately before queueing so the cache and
    // filesystem are always keyed by the exact version that will be installed.
    const options = installOptionsSchema.parse(body.options ?? {})

    const [exactPackageString, ...exactAdditionalPackages] = await Promise.all(
      [body.packageString, ...options.additionalPackages].map(packageString =>
        resolveRegistryPackageSpec(packageString),
      ),
    )

    const { id, installation } = await store.subscribe(
      exactPackageString,
      {
        ...options,
        additionalPackages: exactAdditionalPackages,
        isLocal: false,
      },
      signal,
    )

    return { ...installation, subscriptionId: id }
  } catch (error) {
    if (signal.aborted) return reply

    return sendInstallationError(
      error instanceof Error ? error : new Error(String(error)),
      reply,
    )
  }
})

fastify.delete<{ Params: { id: string } }>(
  '/installations/:id',
  async (request, reply) => {
    await store.unsubscribe(request.params.id)

    return reply.code(204).send()
  },
)

// This service already listens on loopback; VictoriaMetrics scrapes it directly.
fastify.get('/metrics', async (_request, reply) => {
  return reply
    .type(outcomes.registry.contentType)
    .send(await outcomes.registry.metrics())
})

if (process.env.ENABLE_DIAGNOSTICS === 'true') {
  fastify.get('/diagnostics', async () => store.diagnostics())
}

// Stop physical installs before Fastify drains outstanding HTTP handlers.
fastify.addHook('preClose', async () => store.close())

const port = positiveInteger(process.env.PORT, 7003)

await fastify.listen({ host: '127.0.0.1', port })

console.log(`installation service listening on ${port}`)

async function shutdown() {
  await fastify.close()
}

process.once('SIGINT', shutdown)

process.once('SIGTERM', shutdown)
