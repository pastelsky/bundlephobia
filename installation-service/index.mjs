import 'dotenv-defaults/config.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
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

function installOptions(value) {
  if (!value || typeof value !== 'object') return { additionalPackages: [] }
  return {
    client: value.client,
    limitConcurrency: value.limitConcurrency,
    networkConcurrency: value.networkConcurrency,
    additionalPackages: Array.isArray(value.additionalPackages)
      ? value.additionalPackages
      : [],
    installTimeout: value.installTimeout,
    debug: value.debug,
    // REST callers may install registry packages, never arbitrary local paths.
    isLocal: false,
  }
}

async function installPackageWithVersion(packageString, options) {
  const installation = await installPackage(packageString, options)
  try {
    const packageJSON = JSON.parse(
      await fs.readFile(
        path.join(installation.packagePath, 'package.json'),
        'utf8'
      )
    )
    if (typeof packageJSON.version !== 'string') {
      throw new Error('Installed package does not declare a version')
    }
    return { ...installation, packageVersion: packageJSON.version }
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
      positiveInteger(process.env.INSTALLATION_CONCURRENCY, 2)
    ),
    rootPath:
      process.env.INSTALLATION_ROOT_PATH || '/tmp/tmp-build/installations',
    retentionMs: positiveInteger(
      process.env.INSTALLATION_RETENTION_MS,
      20 * 60_000
    ),
  }
)
await store.start()
const fastify = Fastify({ bodyLimit: 64 * 1024 })

fastify.post('/installations', async (request, reply) => {
  const body = request.body
  if (!body || typeof body.packageString !== 'string') {
    return reply.code(400).send({
      name: 'InstallError',
      originalError: 'packageString must be an npm registry package spec',
    })
  }

  try {
    // Resolve mutable tags/ranges immediately before queueing so the cache and
    // filesystem are always keyed by the exact version that will be installed.
    const options = installOptions(body.options)
    const [exactPackageString, ...exactAdditionalPackages] = await Promise.all(
      [body.packageString, ...options.additionalPackages].map(packageString =>
        resolveRegistryPackageSpec(packageString)
      )
    )
    return await store.get(exactPackageString, {
      ...options,
      additionalPackages: exactAdditionalPackages,
    })
  } catch (error) {
    if (error instanceof UnsupportedRegistryPackageSpecError) {
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
