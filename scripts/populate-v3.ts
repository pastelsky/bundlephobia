import fs from 'fs'
import path from 'path'

import axios from 'axios'

interface ProgressState {
  completed: Set<string>
  completed_exports: Set<string>
  failed: Set<string>
  stats: {
    success: number
    failed: number
    skipped: number
    exports_success: number
    exports_failed: number
  }
}

interface TopPackage {
  name: string
  versions: string[]
  priority: number
}

interface SizeBuildResult {
  success: boolean
  size?: number
  gzip?: number
  error?: string
  skipped?: boolean
  v2?: {
    size: number
    gzip: number
  } | null
}

interface ExportsBuildResult {
  success: boolean
  data?: unknown
  error?: string
  skipped?: boolean
  v2?: unknown
}

const API_BASE = process.env.API_BASE || 'http://localhost:5000'
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10)
const TIMEOUT_MS = 120000
const TOP_PACKAGES_PATH = path.join(__dirname, '../top-packages.json')
const PROGRESS_PATH = path.join(__dirname, '../populate-v3-progress.json')
const STATS_PATH = path.join(__dirname, '../populate-v3-stats.json')
const COMPARISON_PATH = path.join(__dirname, '../populate-v3-comparison.json')
const EXPORTS_STATS_PATH = path.join(
  __dirname,
  '../populate-v3-exports-stats.json'
)
const EXPORTS_COMPARISON_PATH = path.join(
  __dirname,
  '../populate-v3-exports-comparison.json'
)
const CACHE_SERVICE_BASE =
  process.env.CACHE_SERVICE_BASE || 'http://localhost:7001'

const args = process.argv.slice(2)
const shouldReset = args.includes('--reset')
const concurrencyArg = args.find(argument =>
  argument.startsWith('--concurrency=')
)
const concurrency = concurrencyArg
  ? parseInt(concurrencyArg.split('=')[1], 10)
  : CONCURRENCY

const limitArg = args.find(argument => argument.startsWith('--limit-packages='))
const packageLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

const packageFilterArg = args.find(argument =>
  argument.startsWith('--package=')
)
const packageFilter = packageFilterArg ? packageFilterArg.split('=')[1] : null

const sizesOnly = args.includes('--sizes-only')
const exportsOnly = args.includes('--exports-only')

if (sizesOnly && exportsOnly) {
  console.error(
    'Error: Cannot use both --sizes-only and --exports-only flags together'
  )
  process.exit(1)
}

console.log(`
=== Populate modules-v3 ===
API: ${API_BASE}
Concurrency: ${concurrency}
Package Limit: ${packageLimit}
Package Filter: ${packageFilter || 'None'}
Reset: ${shouldReset}
Mode: ${
  sizesOnly
    ? 'Sizes Only'
    : exportsOnly
    ? 'Exports Only'
    : 'Both (Sizes + Exports)'
}
`)

function loadProgress(): ProgressState {
  if (shouldReset && !packageFilter) {
    console.log('Resetting ALL progress...')
    return {
      completed: new Set(),
      completed_exports: new Set(),
      failed: new Set(),
      stats: {
        success: 0,
        failed: 0,
        skipped: 0,
        exports_success: 0,
        exports_failed: 0,
      },
    }
  }

  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) as {
        completed: string[]
        completed_exports?: string[]
        failed: string[]
        stats?: Partial<ProgressState['stats']>
      }
      console.log(
        `Resuming: ${data.completed.length} sizes completed, ${
          data.completed_exports?.length || 0
        } exports completed, ${data.failed.length} failed`
      )

      const stats = data.stats || {}
      return {
        completed: new Set(data.completed),
        completed_exports: new Set(data.completed_exports || []),
        failed: new Set(data.failed),
        stats: {
          success: stats.success || 0,
          failed: stats.failed || 0,
          skipped: stats.skipped || 0,
          exports_success: stats.exports_success || 0,
          exports_failed: stats.exports_failed || 0,
        },
      }
    } catch {
      console.log('Could not load progress, starting fresh')
    }
  }

  return {
    completed: new Set(),
    completed_exports: new Set(),
    failed: new Set(),
    stats: {
      success: 0,
      failed: 0,
      skipped: 0,
      exports_success: 0,
      exports_failed: 0,
    },
  }
}

function saveProgress(progress: ProgressState) {
  const data = {
    completed: Array.from(progress.completed),
    completed_exports: Array.from(progress.completed_exports),
    failed: Array.from(progress.failed),
    stats: progress.stats,
    lastSaved: new Date().toISOString(),
  }
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data, null, 2))
}

function saveStats(stats: unknown[]) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2))
}

function saveComparisons(comparisons: unknown[]) {
  fs.writeFileSync(COMPARISON_PATH, JSON.stringify(comparisons, null, 2))
}

function saveExportsStats(stats: unknown[]) {
  fs.writeFileSync(EXPORTS_STATS_PATH, JSON.stringify(stats, null, 2))
}

function saveExportsComparisons(comparisons: unknown[]) {
  fs.writeFileSync(
    EXPORTS_COMPARISON_PATH,
    JSON.stringify(comparisons, null, 2)
  )
}

function withAbortableTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutValue: T
) {
  const controller = new AbortController()
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<T>(resolve => {
    timeoutId = setTimeout(() => {
      console.log(`[WATCHDOG] Aborting request after ${timeoutMs}ms`)
      controller.abort()
      resolve(timeoutValue)
    }, timeoutMs)
  })

  const workPromise = promiseFactory(controller.signal)
    .then(result => {
      clearTimeout(timeoutId)
      return result
    })
    .catch(error => {
      clearTimeout(timeoutId)
      if (
        error instanceof Error &&
        (error.name === 'CanceledError' || error.name === 'AbortError')
      ) {
        return timeoutValue
      }
      throw error
    })

  return Promise.race([workPromise, timeoutPromise])
}

async function buildPackage(
  packageName: string,
  version: string,
  signal: AbortSignal | null = null
): Promise<SizeBuildResult> {
  const key = `${packageName}@${version}`
  let v2Result: SizeBuildResult['v2'] = null

  try {
    const v2Response = await axios.get(`${CACHE_SERVICE_BASE}/package-cache`, {
      params: { name: packageName, version, readKey: 'modules-v2' },
      timeout: 10000,
    })
    if (v2Response.data && v2Response.data.size) {
      v2Result = { size: v2Response.data.size, gzip: v2Response.data.gzip }
    }
  } catch {}

  const url = `${API_BASE}/api/size?package=${encodeURIComponent(
    key
  )}&record=true&force=true`

  try {
    const cancelSource = axios.CancelToken.source()
    signal?.addEventListener('abort', () => {
      cancelSource.cancel('Request aborted')
    })

    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      cancelToken: cancelSource.token,
    })
    if (response.data && response.data.size) {
      return {
        success: true,
        size: response.data.size,
        gzip: response.data.gzip,
        v2: v2Result,
      }
    }
    return { success: false, error: 'No size in response', v2: v2Result }
  } catch (error) {
    if (axios.isCancel(error)) {
      return { success: false, error: 'Request aborted', v2: v2Result }
    }

    const axiosError = error as {
      response?: {
        data?: {
          error?: {
            code?: string
            message?: string
          }
        }
      }
      message?: string
    }

    const errorMessage =
      axiosError.response?.data?.error?.code ||
      axiosError.response?.data?.error?.message ||
      axiosError.message ||
      'Unknown Error'

    return { success: false, error: errorMessage, v2: v2Result }
  }
}

async function buildExports(
  packageName: string,
  version: string,
  signal: AbortSignal | null = null
): Promise<ExportsBuildResult> {
  const key = `${packageName}@${version}`
  let v2Result: unknown = null

  try {
    const v2Response = await axios.get(`${CACHE_SERVICE_BASE}/exports-cache`, {
      params: { name: packageName, version, readKey: 'exports' },
      timeout: 10000,
    })
    if (v2Response.data) {
      v2Result = v2Response.data
    }
  } catch {}

  const url = `${API_BASE}/api/exports-sizes?package=${encodeURIComponent(
    key
  )}&force=true`

  try {
    const cancelSource = axios.CancelToken.source()
    signal?.addEventListener('abort', () => {
      cancelSource.cancel('Request aborted')
    })

    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      cancelToken: cancelSource.token,
    })
    if (response.data) {
      return {
        success: true,
        data: response.data,
        v2: v2Result,
      }
    }
    return { success: false, error: 'No data in response', v2: v2Result }
  } catch (error) {
    if (axios.isCancel(error)) {
      return { success: false, error: 'Request aborted', v2: v2Result }
    }

    const axiosError = error as {
      response?: {
        data?: {
          error?: {
            code?: string
            message?: string
          }
        }
      }
      message?: string
    }

    const errorMessage =
      axiosError.response?.data?.error?.code ||
      axiosError.response?.data?.error?.message ||
      axiosError.message ||
      'Unknown Error'

    return { success: false, error: errorMessage, v2: v2Result }
  }
}

async function processBatch(
  batch: Array<{ packageName: string; version: string }>,
  progress: ProgressState,
  detailedStats: unknown[],
  comparisons: unknown[],
  exportsStats: unknown[],
  exportsComparisons: unknown[]
) {
  const promises = batch.map(async ({ packageName, version }) => {
    const key = `${packageName}@${version}`
    const shouldBuildSize = !exportsOnly && !progress.completed.has(key)
    const shouldBuildExports =
      !sizesOnly && !progress.completed_exports.has(key)

    if (!shouldBuildSize && !shouldBuildExports) {
      progress.stats.skipped++
      return { key, skipped: true }
    }

    const startTime = Date.now()
    let sizeResult: SizeBuildResult = { success: true, skipped: true }
    let exportsResult: ExportsBuildResult = { success: true, skipped: true }

    const tasks: Array<Promise<void>> = []

    if (shouldBuildSize) {
      console.log(`[DEBUG] Building size for ${key}`)
      tasks.push(
        withAbortableTimeout(
          signal => buildPackage(packageName, version, signal),
          TIMEOUT_MS + 5000,
          { success: false, error: 'Operation timeout (aborted)' }
        ).then(result => {
          sizeResult = result
        })
      )
    }

    if (shouldBuildExports) {
      console.log(`[DEBUG] Building exports for ${key}`)
      tasks.push(
        withAbortableTimeout(
          signal => buildExports(packageName, version, signal),
          TIMEOUT_MS + 5000,
          { success: false, error: 'Operation timeout (aborted)' }
        ).then(result => {
          exportsResult = result
        })
      )
    }

    if (tasks.length > 0) {
      await Promise.all(tasks)
    }

    console.log(
      `[DEBUG] Completed ${key} in ${((Date.now() - startTime) / 1000).toFixed(
        1
      )}s`
    )
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    if (shouldBuildSize) {
      if (sizeResult.success) {
        progress.completed.add(key)
        progress.stats.success++
        detailedStats.push({
          package: key,
          status: 'success',
          size: sizeResult.size,
          gzip: sizeResult.gzip,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString(),
        })

        if (
          sizeResult.v2 &&
          sizeResult.size != null &&
          sizeResult.gzip != null
        ) {
          comparisons.push({
            package: key,
            v2_size: sizeResult.v2.size,
            v3_size: sizeResult.size,
            v2_gzip: sizeResult.v2.gzip,
            v3_gzip: sizeResult.gzip,
            size_diff: sizeResult.size - sizeResult.v2.size,
            gzip_diff: sizeResult.gzip - sizeResult.v2.gzip,
            timestamp: new Date().toISOString(),
          })
        }
      } else {
        progress.failed.add(key)
        progress.stats.failed++
        detailedStats.push({
          package: key,
          status: 'failed',
          error: sizeResult.error,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString(),
        })
      }
    }

    if (shouldBuildExports) {
      if (exportsResult.success) {
        progress.completed_exports.add(key)
        progress.stats.exports_success++
        exportsStats.push({
          package: key,
          status: 'success',
          data: exportsResult.data,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString(),
        })

        if (exportsResult.v2) {
          exportsComparisons.push({
            package: key,
            v2: exportsResult.v2,
            v3: exportsResult.data,
            timestamp: new Date().toISOString(),
          })
        }
      } else {
        progress.stats.exports_failed++
        exportsStats.push({
          package: key,
          status: 'failed',
          error: exportsResult.error,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString(),
        })
      }
    }

    return {
      key,
      duration,
      size: shouldBuildSize ? sizeResult : null,
      exports: shouldBuildExports ? exportsResult : null,
    }
  })

  return Promise.all(promises)
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}h ${m}m ${s}s`
}

async function main() {
  if (!fs.existsSync(TOP_PACKAGES_PATH)) {
    console.error(
      'top-packages.json not found. Run generate-top-packages.js first.'
    )
    process.exit(1)
  }

  const packages = JSON.parse(
    fs.readFileSync(TOP_PACKAGES_PATH, 'utf8')
  ) as TopPackage[]
  console.log(`Loaded ${packages.length} packages from top-packages.json`)

  let targetPackages = packages
  if (packageFilter) {
    targetPackages = packages.filter(pkg => pkg.name === packageFilter)
    console.log(
      `Filtering to package: ${packageFilter} (found ${targetPackages.length} matches)`
    )
  }

  targetPackages = targetPackages.slice(0, packageLimit)
  if (packageLimit !== Infinity) {
    console.log(`Limiting to top ${packageLimit} packages`)
  }

  const allVersions: Array<{
    packageName: string
    version: string
    priority: number
  }> = []

  for (const pkg of targetPackages) {
    for (const version of pkg.versions) {
      allVersions.push({
        packageName: pkg.name,
        version,
        priority: pkg.priority,
      })
    }
  }

  console.log(`Total versions to process: ${allVersions.length}`)
  console.log('Loading progress and stats files...')

  const progress = loadProgress()
  let detailedStats: unknown[] = []
  let comparisons: unknown[] = []
  let exportsStats: unknown[] = []
  let exportsComparisons: unknown[] = []

  if (!(shouldReset && !packageFilter)) {
    if (fs.existsSync(STATS_PATH)) {
      try {
        detailedStats = JSON.parse(
          fs.readFileSync(STATS_PATH, 'utf8')
        ) as unknown[]
      } catch {}
    }
    if (fs.existsSync(COMPARISON_PATH)) {
      try {
        comparisons = JSON.parse(
          fs.readFileSync(COMPARISON_PATH, 'utf8')
        ) as unknown[]
      } catch {}
    }
    if (fs.existsSync(EXPORTS_STATS_PATH)) {
      try {
        exportsStats = JSON.parse(
          fs.readFileSync(EXPORTS_STATS_PATH, 'utf8')
        ) as unknown[]
      } catch {}
    }
    if (fs.existsSync(EXPORTS_COMPARISON_PATH)) {
      try {
        exportsComparisons = JSON.parse(
          fs.readFileSync(EXPORTS_COMPARISON_PATH, 'utf8')
        ) as unknown[]
      } catch {}
    }
  }

  if (shouldReset && packageFilter) {
    console.log(`Clearing existing data for package: ${packageFilter}`)
    const keysToRemove = new Set<string>()

    progress.completed.forEach(key => {
      if (key.startsWith(`${packageFilter}@`)) keysToRemove.add(key)
    })
    progress.completed_exports.forEach(key => {
      if (key.startsWith(`${packageFilter}@`)) keysToRemove.add(key)
    })
    progress.failed.forEach(key => {
      if (key.startsWith(`${packageFilter}@`)) keysToRemove.add(key)
    })

    keysToRemove.forEach(key => {
      progress.completed.delete(key)
      progress.completed_exports.delete(key)
      progress.failed.delete(key)
    })

    detailedStats = detailedStats.filter(
      item =>
        !(item as { package?: string }).package?.startsWith(`${packageFilter}@`)
    )
    comparisons = comparisons.filter(
      item =>
        !(item as { package?: string }).package?.startsWith(`${packageFilter}@`)
    )
    exportsStats = exportsStats.filter(
      item =>
        !(item as { package?: string }).package?.startsWith(`${packageFilter}@`)
    )
    exportsComparisons = exportsComparisons.filter(
      item =>
        !(item as { package?: string }).package?.startsWith(`${packageFilter}@`)
    )
  }

  console.log('Checking API reachability...')
  try {
    await axios.get(`${API_BASE}/api/recent?limit=1`, { timeout: 10000 })
    console.log('API is reachable')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Cannot reach API at ${API_BASE}. Error: ${message}`)
    console.error('Make sure the server is running.')
    process.exit(1)
  }

  const startTime = Date.now()
  let processed = 0

  console.log('\nStarting builds...\n')

  for (let index = 0; index < allVersions.length; index += concurrency) {
    const batch = allVersions.slice(index, index + concurrency)
    console.log(
      `\n[DEBUG] Processing batch ${
        Math.floor(index / concurrency) + 1
      }, packages: ${batch
        .map(item => `${item.packageName}@${item.version}`)
        .join(', ')}`
    )

    const results = await processBatch(
      batch,
      progress,
      detailedStats,
      comparisons,
      exportsStats,
      exportsComparisons
    )
    console.log(`[DEBUG] Batch completed, got ${results.length} results`)

    for (const result of results) {
      const parts: string[] = []
      let symbol = '✓'

      if (!result.size && !result.exports) {
        continue
      }

      if (result.size) {
        if (result.size.success && result.size.size != null) {
          parts.push(`Size: ${(result.size.size / 1024).toFixed(1)}kB`)
        } else {
          symbol = '✗'
          parts.push(`Size: Failed (${result.size.error})`)
        }
      }

      if (result.exports) {
        if (result.exports.success) {
          parts.push('Exports: OK')
        } else {
          if (symbol === '✓') symbol = '⚠'
          parts.push(`Exports: Failed (${result.exports.error})`)
        }
      }

      console.log(
        `${symbol} ${result.key} (${result.duration}s) - ${parts.join(', ')}`
      )
    }

    processed = Math.min(index + concurrency, allVersions.length)
    const elapsed = (Date.now() - startTime) / 1000
    const rate = (progress.stats.success + progress.stats.failed) / elapsed
    const remaining = (allVersions.length - processed) / (rate || 1)

    console.log(
      `\n[${processed}/${allVersions.length}] Sizes (S: ${progress.stats.success}, F: ${progress.stats.failed}), Exports (S: ${progress.stats.exports_success}, F: ${progress.stats.exports_failed}), Skipped: ${progress.stats.skipped}`
    )
    console.log(
      `Elapsed: ${formatTime(elapsed)}, ETA: ${formatTime(remaining)}\n`
    )

    saveProgress(progress)
    saveStats(detailedStats)
    saveComparisons(comparisons)
    saveExportsStats(exportsStats)
    saveExportsComparisons(exportsComparisons)
  }

  const totalTime = (Date.now() - startTime) / 1000
  console.log('\n=== Completed ===')
  console.log(`Total time: ${formatTime(totalTime)}`)
  console.log(`Success: ${progress.stats.success}`)
  console.log(`Failed: ${progress.stats.failed}`)
  console.log(`Skipped: ${progress.stats.skipped}`)
  console.log(`\nProgress saved to: ${PROGRESS_PATH}`)
  console.log(`Stats saved to: ${STATS_PATH}`)
  console.log(`Comparison saved to: ${COMPARISON_PATH}`)
  console.log(`Exports Stats saved to: ${EXPORTS_STATS_PATH}`)
  console.log(`Exports Comparison saved to: ${EXPORTS_COMPARISON_PATH}`)

  if (progress.stats.failed === 0 && progress.stats.success > 0) {
    console.log('\nAll packages built successfully!')
  } else if (progress.stats.failed > 0) {
    console.log(`\n${progress.stats.failed} packages failed. Re-run to retry.`)
  }

  process.exit(0)
}

process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Progress has been saved.')
  process.exit(0)
})

void main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
