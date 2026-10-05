import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createInstallationProvider } from '../build-service/installationProvider.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    operation: { type: 'string', default: 'size' },
    repeat: { type: 'string', default: '1' },
    'no-minify': { type: 'boolean', default: false },
    output: { type: 'string' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:7003' },
    'max-rss-mb': { type: 'string', default: '1024' },
    'timeout-ms': { type: 'string', default: '120000' },
  },
})

const [packageString] = positionals

const repeat = Number(values.repeat)

const maxRssBytes = Number(values['max-rss-mb']) * 1024 * 1024

const timeoutMs = Number(values['timeout-ms'])

if (
  positionals.length !== 1 ||
  !packageString ||
  !['size', 'exports', 'exports-sizes'].includes(values.operation) ||
  !Number.isInteger(repeat) ||
  repeat < 1 ||
  repeat > 10 ||
  !Number.isFinite(maxRssBytes) ||
  maxRssBytes <= 0 ||
  !Number.isFinite(timeoutMs) ||
  timeoutMs <= 0
)
  throw new Error(
    'Usage: node scripts/profile-build.ts package@version [--operation size|exports|exports-sizes] [--repeat 1..10]',
  )

if (process.platform !== 'linux')
  throw new Error('External /proc sampling requires Linux')

const directory = values.output
  ? path.resolve(values.output)
  : await mkdtemp(path.join(tmpdir(), 'bundlephobia-profile-'))

if (values.output) await mkdir(directory) // Refuse to overwrite a previous replay.

// Hold the lease in the supervisor, so killing the replay still releases it.
// Only the installation daemon installs; the replay receives prepared paths.
const installation = await createInstallationProvider(values.endpoint)(
  packageString,
  {
    installTimeout: 60000,
    signal: AbortSignal.timeout(timeoutMs),
  },
)

try {
  const startedAt = Date.now()

  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      '--expose-gc',
      '--cpu-prof',
      `--cpu-prof-dir=${directory}`,
      fileURLToPath(
        new URL('../build-service/profileBuild.ts', import.meta.url),
      ),
      values.operation,
      directory,
      String(repeat),
      String(!values['no-minify']),
    ],
    {
      env: {
        ...process.env,
        BUILD_METRICS_DIR: directory,
        BUILD_METRICS_PEAK_RSS_MB: '1',
        BUILD_PROFILE_INSTALLATION: JSON.stringify(installation),
      },
      stdio: 'inherit',
    },
  )

  const samples: {
    timestamp: string
    elapsedMs: number
    rssBytes: number
    anonymousBytes: number
    swapBytes: number
  }[] = []

  let stoppedBecause: string | undefined
  let killTimer: NodeJS.Timeout | undefined

  const stop = (reason: string) => {
    if (stoppedBecause) return
    stoppedBecause = reason
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), 2000)
  }

  const interrupt = () => stop('supervisor interrupted')
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  const timeout = setTimeout(() => stop('timeout'), timeoutMs)

  // Runs outside the compiler process: synchronous JS/native work cannot block
  // these samples. Read only this child's maps, not the host's entire /proc tree.
  const sample = async () => {
    try {
      const contents = await readFile(`/proc/${child.pid}/smaps_rollup`, 'utf8')

      const bytes = (key: string) =>
        Number(
          contents.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] || 0,
        ) * 1024

      const rssBytes = bytes('Rss')
      samples.push({
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        rssBytes,
        anonymousBytes: bytes('Pss_Anon'),
        swapBytes: bytes('Swap'),
      })

      if (rssBytes > maxRssBytes) stop('RSS limit')

      const trace = await stat(path.join(directory, 'rspack.log')).catch(
        () => undefined,
      )

      if (trace && trace.size > 128 * 1024 * 1024) stop('trace size limit')
    } catch (error) {
      // The child can exit between a timer tick and reading its maps.
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          ['ENOENT', 'ESRCH'].includes(String(error.code))
        )
      )
        stop('sampling failed')
    }
  }

  let pendingSample = Promise.resolve()

  const interval = setInterval(() => {
    pendingSample = pendingSample.then(sample)
  }, 200)

  try {
    const outcome = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })

    clearInterval(interval)
    await pendingSample
    await writeFile(
      path.join(directory, 'external-memory.json'),
      JSON.stringify(
        {
          package: packageString,
          operation: values.operation,
          startedAt: new Date(startedAt).toISOString(),
          ...outcome,
          stoppedBecause,
          maxRssBytes,
          timeoutMs,
          samples,
        },
        null,
        2,
      ),
    )
    console.log(`Build profile saved to ${directory}`)
    process.exitCode = outcome.code === 0 && !stoppedBecause ? 0 : 1
  } finally {
    clearInterval(interval)
    clearTimeout(timeout)
    clearTimeout(killTimer)
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
} finally {
  await installation.release()
}
