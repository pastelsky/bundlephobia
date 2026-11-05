import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import execa from 'execa'
import PQueue from 'p-queue'
import { parse, type ParseError } from 'jsonc-parser'
import { z } from 'zod'

import {
  stateRoot,
  usageFiles,
  segmentBytes,
  lockFile,
  isReusePolicyEnabled,
  createPackageManagerCommand,
} from './paths.ts'

const lockSchema = z.object({
  packages: z.record(z.string(), z.tuple([z.string()]).rest(z.unknown())),
})

/** One metadata lookup per resolved package, never a recursive payload walk. */
export async function installedDependencies(
  installPath: string,
): Promise<string[]> {
  const lockPath = path.join(installPath, 'bun.lock')

  if ((await fs.stat(lockPath)).size > 2 * 1024 * 1024)
    throw new Error('Bun lockfile exceeds accounting limit')
  const errors: ParseError[] = []

  const lock = lockSchema.parse(
    parse(await fs.readFile(lockPath, 'utf8'), errors, {
      allowTrailingComma: true,
    }),
  )

  if (errors.length) throw new Error('Invalid Bun lockfile')
  const entries = Object.entries(lock.packages)

  if (entries.length > 20_000)
    throw new Error('Bun dependency count exceeds accounting limit')
  const queue = new PQueue({ concurrency: 8 })
  const dependencies = new Set<string>()
  await Promise.all(
    entries.map(([locator, [resolved]]) =>
      queue.add(async () => {
        const parts = locator.split('/')
        const segments: string[] = []

        for (let index = 0; index < parts.length; index++) {
          const name = parts[index].startsWith('@')
            ? `${parts[index]}/${parts[++index]}`
            : parts[index]

          segments.push('node_modules', name)
        }

        const manifest = path.resolve(installPath, ...segments, 'package.json')

        if (!manifest.startsWith(`${path.resolve(installPath)}${path.sep}`))
          return

        const existing = await fs.stat(manifest).catch(error => {
          if (error.code !== 'ENOENT') throw error

          return undefined
        })

        // Omitted optional dependencies and unmaterialized lock entries do not count.
        if (existing?.isFile()) dependencies.add(resolved)
      }),
    ),
  )

  return [...dependencies]
}

export async function createBunCachePolicy(
  onError: (error: Error) => void = console.error,
) {
  const enabled = isReusePolicyEnabled()
  const writer = new PQueue({ concurrency: 1 })
  let ledgerBytes: number | undefined
  let eviction: Promise<unknown> | undefined

  return {
    enabled,
    packageManagerCommand: createPackageManagerCommand(enabled),
    async record(installation: { installPath: string; client?: string }) {
      if (!enabled || installation.client !== 'bun') return

      return writer.add(async () => {
        try {
          const dependencies = await installedDependencies(
            installation.installPath,
          )

          const record = `${JSON.stringify(dependencies)}\n`
          const bytes = Buffer.byteLength(record)

          if (bytes > 1024 * 1024)
            throw new Error('Dependency record exceeds accounting limit')
          await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 })
          const current = path.join(stateRoot, usageFiles[1])
          ledgerBytes ??= await fs.stat(current).then(
            stat => stat.size,
            () => 0,
          )

          if (ledgerBytes + bytes > segmentBytes) {
            await fs.rename(current, path.join(stateRoot, usageFiles[0]))
            ledgerBytes = 0
          }

          await fs.appendFile(current, record, { mode: 0o600 })
          ledgerBytes += bytes
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },
    evict() {
      if (!enabled) throw new Error('Reuse policy is disabled')

      if (process.platform !== 'linux')
        throw new Error('Coordinated cache eviction requires Linux flock')

      // All Bun commands share this OS lock. The exclusive holder survives an
      // installer restart; timeout bounds its child independently of this process.
      eviction ??= (async () => {
        const cli = fileURLToPath(
          new URL('../../build/cache-policy.mjs', import.meta.url),
        )

        const child = await execa(
          'flock',
          [
            '--exclusive',
            '--wait',
            '65',
            lockFile,
            'timeout',
            '--kill-after=2s',
            '20s',
            'chrt',
            '--idle',
            '0',
            'ionice',
            '-c',
            '3',
            process.execPath,
            '--max-old-space-size=96',
            cli,
          ],
          { maxBuffer: 64 * 1024, timeout: 90_000, killSignal: 'SIGKILL' },
        )

        return child.stdout.trim()
      })().finally(() => {
        eviction = undefined
      })

      return eviction
    },
  }
}
