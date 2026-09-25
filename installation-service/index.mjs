import 'dotenv-defaults/config.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import { z } from 'zod'
import {
  disposePackage,
  installPackage,
} from 'package-build-stats/installation'
import InstallationStore from './InstallationStore.cjs'
import createInstallQueue from './createInstallQueue.cjs'
import registryPackageSpec from './resolveRegistryPackageSpec.cjs'
import serializeError from '../build-service/serializeError.js'

const { resolveRegistryPackageSpec, UnsupportedRegistryPackageSpecError } =
  registryPackageSpec

function positiveInteger(value, fallback) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const clientSchema = z.enum(['npm', 'yarn', 'pnpm', 'bun'])

const installOptionsSchema = z.object({
  client: z.union([clientSchema, z.array(clientSchema)]).optional(),
  limitConcurrency: z.boolean().optional(),
  networkConcurrency: z.number().optional(),
  additionalPackages: z.array(z.string()).default([]),
  installTimeout: z.number().optional(),
  debug: z.boolean().optional(),
})

function installOptions(value) {
  return installOptionsSchema.parse(value ?? {})
}

async function installPackageWithVersion(packageString, options) {
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

const store = new InstallationStore(
  {
    installPackage: installPackageWithVersion,
    disposePackage,
  },
  {
    queue: createInstallQueue(
      positiveInteger(process.env.INSTALLATION_CONCURRENCY, 2),
    ),
    rootPath:
      process.env.INSTALLATION_ROOT_PATH || '/tmp/tmp-build/installations',
    retentionMs: positiveInteger(
      process.env.INSTALLATION_RETENTION_MS,
      5 * 60_000,
    ),
    leaseMs: positiveInteger(process.env.INSTALLATION_LEASE_MS, 15 * 60_000),
  },
)

await store.start()

const fastify = Fastify({ bodyLimit: 64 * 1024 })

fastify.post('/installations', async (request, reply) => {
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
    const options = installOptions(body.options)

    const [exactPackageString, ...exactAdditionalPackages] = await Promise.all(
      [body.packageString, ...options.additionalPackages].map(packageString =>
        resolveRegistryPackageSpec(packageString),
      ),
    )

    const { id, installation } = await store.subscribe(exactPackageString, {
      ...options,
      additionalPackages: exactAdditionalPackages,
      isLocal: false,
    })

    return { ...installation, subscriptionId: id }
  } catch (error) {
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
    const packageNotFound = ['E404', 'ETARGET'].includes(error?.code)
    const status = packageNotFound ? 404 : 500

    if (packageNotFound) serialized.name = 'PackageNotFoundError'

    return reply.code(status).send(serialized)
  }
})

fastify.delete('/installations/:id', async (request, reply) => {
  await store.unsubscribe(request.params.id)

  return reply.code(204).send()
})

fastify.get('/diagnostics', async () => store.diagnostics())

fastify.addHook('onClose', async () => store.close())

const port = positiveInteger(process.env.PORT, 7003)

await fastify.listen({ host: '127.0.0.1', port })

console.log(`installation service listening on ${port}`)

async function shutdown() {
  await fastify.close()
}

process.once('SIGINT', shutdown)

process.once('SIGTERM', shutdown)
