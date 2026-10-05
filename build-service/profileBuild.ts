import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { experiments } from '@rspack/core'
import {
  eventQueue,
  getPackageStats,
  getPackageExportSizes,
  getAllPackageExports,
} from 'package-build-stats'
import { z } from 'zod'
import { recordBuildPhase } from './buildMemoryTrace.ts'
import { measureBuild } from './metrics.js'

const installation = z
  .object({
    packageString: z.string(),
    packageName: z.string(),
    installPath: z.string(),
    packagePath: z.string(),
  })
  .parse(JSON.parse(process.env.BUILD_PROFILE_INSTALLATION || 'null'))

const [operationInput, directory, repeat, minify] = process.argv.slice(2)

const operation = z
  .enum(['size', 'exports', 'exports-sizes'])
  .parse(operationInput)

const analyze = {
  size: getPackageStats,
  exports: getAllPackageExports,
  'exports-sizes': getPackageExportSizes,
}[operation]

if (!directory) throw new Error('Invalid profile replay arguments')

eventQueue.on('*', recordBuildPhase)

// This API is process-global: use it only in this disposable replay process,
// never register/cleanup it around overlapping production requests.
await experiments.globalTrace.register(
  'info',
  'logger',
  path.join(directory, 'rspack.log'),
)

async function runBuild(run: number) {
  const result = await measureBuild({
    operation,
    packageString: installation.packageString,
    run: () =>
      analyze(installation.packageString, {
        minify: minify !== 'false',
        installationProvider: async () => ({
          ...installation,
          release: async () => {},
        }),
      }),
  })

  await writeFile(
    path.join(directory, `result-${run}.json`),
    JSON.stringify(result),
  )
}

try {
  for (let run = 0; run < Number(repeat); run++) {
    const before = process.memoryUsage()

    await runBuild(run)

    const after = process.memoryUsage()
    global.gc?.()
    await setTimeout(500)
    await writeFile(
      path.join(directory, `retained-${run}.json`),
      JSON.stringify(
        {
          run,
          before,
          after,
          afterGcAndIdle: process.memoryUsage(),
          node: process.version,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
  }
} finally {
  eventQueue.off('*', recordBuildPhase)
  await experiments.globalTrace.cleanup()
}
