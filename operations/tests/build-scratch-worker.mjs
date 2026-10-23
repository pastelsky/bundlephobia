import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  eventQueue,
  getPackageStats,
  getPackageExportSizes,
  getAllPackageExports,
} from 'package-build-stats'
import {
  installPackage,
  disposePackage,
} from 'package-build-stats/installation'
import InstallationStore from '../../installation-service/InstallationStore.ts'
import createInstallQueue from '../../installation-service/createInstallQueue.ts'
import { measureBuild } from '../../build-service/metrics.js'
import { recordBuildPhase } from '../../build-service/buildMemoryTrace.ts'

const specifier = 'nanoid@3.3.11'

const scenario = process.argv[2]

const controller = new AbortController()

const store = new InstallationStore(
  {
    installPackage: async (...args) => {
      const installation = await installPackage(...args)

      const metadata = JSON.parse(
        await fs.readFile(
          path.join(installation.packagePath, 'package.json'),
          'utf8',
        ),
      )

      return { ...installation, packageVersion: metadata.version }
    },
    disposePackage,
  },
  { queue: createInstallQueue(2) },
)

eventQueue.on('*', recordBuildPhase)

eventQueue.on('TASK_PACKAGE_COMPILE', details => {
  if (!details.isSuccessful) return

  if (scenario === 'crash') process.kill(process.pid, 'SIGKILL')

  if (scenario === 'cancel') controller.abort()
})

const options = {
  signal: controller.signal,
  installationProvider: async (packageString, installOptions) => {
    const lease = await store.subscribe(packageString, {
      ...installOptions,
      client: process.env.SCRATCH_CLIENT,
    })

    return { ...lease.installation, release: () => store.unsubscribe(lease.id) }
  },
}

async function analyze(operation, run) {
  return measureBuild({ packageString: specifier, operation, run })
}

await store.start()

try {
  if (scenario === 'success') {
    const [stats, exports, sizes] = await Promise.all([
      analyze('size', () => getPackageStats(specifier, options)),
      analyze('exports', () => getAllPackageExports(specifier, options)),
      analyze('exports-sizes', () => getPackageExportSizes(specifier, options)),
    ])

    assert.ok(stats.size > 0)
    assert.ok(Object.keys(exports).length > 0)
    assert.ok(sizes.assets.length > 0)
  } else if (scenario === 'failure') {
    await assert.rejects(
      analyze('size', () =>
        getPackageStats(specifier, { ...options, entryPoint: './missing' }),
      ),
      error =>
        ['BuildError', 'EntryPointError', 'MissingDependencyError'].includes(
          error.name,
        ),
    )
  } else if (scenario === 'cancel') {
    await assert.rejects(
      analyze('size', () => getPackageStats(specifier, options)),
      { name: 'BuildCancelledError' },
    )
  } else if (scenario === 'crash') {
    await analyze('size', () => getPackageStats(specifier, options))
    throw new Error('Crash scenario never reached generated build output')
  } else {
    throw new Error(`Unknown scenario: ${scenario}`)
  }

  assert.equal((await store.diagnostics()).subscriptions, 0)
} finally {
  await store.close()
}
