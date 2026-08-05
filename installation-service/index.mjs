import 'dotenv-defaults/config.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import {
  createPackageWorkspace,
  disposePackage,
  installPackage,
} from 'package-build-stats/installation'
import npa from 'npm-package-arg'
import InstallationStore from './InstallationStore.cjs'
import serializeError from '../build-service/serializeError.js'

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function installOptions(value) {
  if (!value || typeof value !== 'object') return {}
  return {
    client: value.client,
    limitConcurrency: value.limitConcurrency,
    networkConcurrency: value.networkConcurrency,
    additionalPackages: value.additionalPackages,
    installTimeout: value.installTimeout,
    debug: value.debug,
    // REST callers may install registry packages, never arbitrary local paths.
    isLocal: false,
  }
}

function isRegistryPackage(packageString) {
  try {
    return ['tag', 'version', 'range'].includes(npa(packageString).type)
  } catch {
    return false
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
    createPackageWorkspace,
    disposePackage,
  },
  {
    concurrency: positiveInteger(process.env.INSTALLATION_CONCURRENCY, 2),
    idleMs: positiveInteger(process.env.INSTALLATION_IDLE_MS, 5_000),
    leaseMs: positiveInteger(process.env.INSTALLATION_LEASE_MS, 5 * 60_000),
  }
)
const fastify = Fastify({ bodyLimit: 64 * 1024 })

fastify.post('/installations', async (request, reply) => {
  const body = request.body
  if (
    !body ||
    typeof body.packageString !== 'string' ||
    !isRegistryPackage(body.packageString)
  ) {
    return reply.code(400).send({
      name: 'InstallError',
      originalError: 'packageString must be an npm registry package',
    })
  }

  try {
    return await store.acquire(body.packageString, installOptions(body.options))
  } catch (error) {
    const serialized = serializeError(error)
    const status = serialized.name === 'PackageNotFoundError' ? 404 : 500
    return reply.code(status).send(serialized)
  }
})

fastify.delete('/installations/:id', async (request, reply) => {
  await store.release(request.params.id)
  return reply.code(204).send()
})

fastify.get('/diagnostics', async () => store.diagnostics())

fastify.addHook('onClose', async () => store.close())

const port = positiveInteger(process.env.PORT, 7003)
await fastify.listen({ host: '127.0.0.1', port })
console.log(`installation service listening on ${port}`)
