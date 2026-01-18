/**
 * Script to pre-populate modules-v3 by building top packages
 *
 * Prerequisites:
 * - Ensure services are running (yarn dev or pm2)
 * - Ensure FIREBASE_WRITE_KEY=modules-v3 in environment
 *
 * This script:
 * - Reads top-packages.json
 * - Builds each package@version by calling the API
 * - Tracks progress for resumability
 * - Runs with configurable concurrency
 *
 * Usage: node scripts/populate-v3.js [--concurrency=N] [--reset]
 */

const path = require('path')
const fs = require('fs')
const axios = require('axios')

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:5000'
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10)
const TIMEOUT_MS = 120000 // 120 seconds per request
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

// Parse command line args
const args = process.argv.slice(2)
const shouldReset = args.includes('--reset')
const concurrencyArg = args.find(a => a.startsWith('--concurrency='))
const concurrency = concurrencyArg
  ? parseInt(concurrencyArg.split('=')[1], 10)
  : CONCURRENCY

const limitArg = args.find(a => a.startsWith('--limit-packages='))
const packageLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

const packageFilterArg = args.find(a => a.startsWith('--package='))
const packageFilter = packageFilterArg ? packageFilterArg.split('=')[1] : null

const sizesOnly = args.includes('--sizes-only')
const exportsOnly = args.includes('--exports-only')

// Validate flags
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

// Load progress
function loadProgress() {
  // Only full reset if requested AND no package filter
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
      const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
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
    } catch (e) {
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

// Save progress
function saveProgress(progress) {
  const data = {
    completed: Array.from(progress.completed),
    completed_exports: Array.from(progress.completed_exports),
    failed: Array.from(progress.failed),
    stats: progress.stats,
    lastSaved: new Date().toISOString(),
  }
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data, null, 2))
}

// Save detailed stats
function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2))
}

// Save comparisons
function saveComparisons(comparisons) {
  fs.writeFileSync(COMPARISON_PATH, JSON.stringify(comparisons, null, 2))
}

// Save exports stats
function saveExportsStats(stats) {
  fs.writeFileSync(EXPORTS_STATS_PATH, JSON.stringify(stats, null, 2))
}

// Save exports comparisons
function saveExportsComparisons(comparisons) {
  fs.writeFileSync(
    EXPORTS_COMPARISON_PATH,
    JSON.stringify(comparisons, null, 2)
  )
}

// Timeout wrapper that ABORTS the underlying request
function withAbortableTimeout(promiseFactory, timeoutMs, timeoutValue) {
  const controller = new AbortController()
  let timeoutId

  const timeoutPromise = new Promise(resolve => {
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
    .catch(err => {
      clearTimeout(timeoutId)
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return timeoutValue
      }
      throw err
    })

  return Promise.race([workPromise, timeoutPromise])
}

// Build a single package version
async function buildPackage(packageName, version, signal = null) {
  const key = `${packageName}@${version}`

  // 1. Fetch v2 data from cache-service (short timeout, no external signal)
  let v2Result = null
  try {
    const v2Response = await axios.get(`${CACHE_SERVICE_BASE}/package-cache`, {
      params: { name: packageName, version: version, readKey: 'modules-v2' },
      timeout: 10000,
    })
    if (v2Response.data && v2Response.data.size) {
      v2Result = { size: v2Response.data.size, gzip: v2Response.data.gzip }
    }
  } catch (err) {
    // v2 doesn't exist or request failed
  }

  // 2. Fetch v3 data (trigger build) - use external signal for abort
  const url = `${API_BASE}/api/size?package=${encodeURIComponent(
    key
  )}&record=true&force=true`

  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      signal: signal, // Use the passed signal for abort
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
  } catch (err) {
    if (err.name === 'CanceledError' || err.name === 'AbortError') {
      return { success: false, error: 'Request aborted', v2: v2Result }
    }
    const errorMsg =
      err.response?.data?.error?.code ||
      err.response?.data?.error?.message ||
      err.message ||
      'Unknown Error'
    return { success: false, error: errorMsg, v2: v2Result }
  }
}

async function buildExports(packageName, version, signal = null) {
  const key = `${packageName}@${version}`

  // 1. Fetch v2 data from cache-service (short timeout, no external signal)
  let v2Result = null
  try {
    const v2Response = await axios.get(`${CACHE_SERVICE_BASE}/exports-cache`, {
      params: { name: packageName, version: version, readKey: 'exports' },
      timeout: 10000,
    })
    if (v2Response.data) {
      v2Result = v2Response.data
    }
  } catch (err) {
    // v2 doesn't exist or request failed
  }

  // 2. Fetch v3 data (trigger build) - use external signal for abort
  const url = `${API_BASE}/api/exports-sizes?package=${encodeURIComponent(
    key
  )}&force=true`

  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      signal: signal, // Use the passed signal for abort
    })
    if (response.data) {
      return {
        success: true,
        data: response.data,
        v2: v2Result,
      }
    }
    return { success: false, error: 'No data in response', v2: v2Result }
  } catch (err) {
    if (err.name === 'CanceledError' || err.name === 'AbortError') {
      return { success: false, error: 'Request aborted', v2: v2Result }
    }
    const errorMsg =
      err.response?.data?.error?.code ||
      err.response?.data?.error?.message ||
      err.message ||
      'Unknown Error'
    return { success: false, error: errorMsg, v2: v2Result }
  }
}

// Process a batch of package versions in parallel (with abort handling to prevent hangs)
async function processBatch(
  batch,
  progress,
  detailedStats,
  comparisons,
  exportsStats,
  exportsComparisons
) {
  const promises = batch.map(async ({ packageName, version }) => {
    const key = `${packageName}@${version}`

    // Determine what to build based on flags and completion status
    const shouldBuildSize = !exportsOnly && !progress.completed.has(key)
    const shouldBuildExports =
      !sizesOnly && !progress.completed_exports.has(key)

    if (!shouldBuildSize && !shouldBuildExports) {
      progress.stats.skipped++
      return { key, skipped: true }
    }

    const startTime = Date.now()
    let sizeResult = { success: true, skipped: true }
    let exportsResult = { success: true, skipped: true }

    // Run size and exports in parallel for THIS package (different endpoints)
    const tasks = []
    if (shouldBuildSize) {
      console.log(`[DEBUG] Building size for ${key}`)
      tasks.push(
        withAbortableTimeout(
          signal => buildPackage(packageName, version, signal),
          TIMEOUT_MS + 5000,
          { success: false, error: 'Operation timeout (aborted)' }
        ).then(res => {
          sizeResult = res
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
        ).then(res => {
          exportsResult = res
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
    const finalResult = { key, duration }

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

        if (sizeResult.v2) {
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
        finalResult.success = true
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
        finalResult.error = sizeResult.error
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
        finalResult.exports_error = exportsResult.error
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

// Format time
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}h ${m}m ${s}s`
}

async function main() {
  // Load packages
  if (!fs.existsSync(TOP_PACKAGES_PATH)) {
    console.error(
      'top-packages.json not found. Run generate-top-packages.js first.'
    )
    process.exit(1)
  }

  const packages = JSON.parse(fs.readFileSync(TOP_PACKAGES_PATH, 'utf8'))
  console.log(`Loaded ${packages.length} packages from top-packages.json`)

  // Limit packages if specified
  let targetPackages = packages
  if (packageFilter) {
    targetPackages = packages.filter(p => p.name === packageFilter)
    console.log(
      `Filtering to package: ${packageFilter} (found ${targetPackages.length} matches)`
    )
  }

  targetPackages = targetPackages.slice(0, packageLimit)
  if (packageLimit !== Infinity) {
    console.log(`Limiting to top ${packageLimit} packages`)
  }

  // Flatten to package@version pairs, ordered by priority
  const allVersions = []
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
  // Load progress
  const progress = loadProgress()
  let detailedStats = []
  let comparisons = []
  let exportsStats = []
  let exportsComparisons = []

  // Load existing stats unless doing a full global reset
  if (!(shouldReset && !packageFilter)) {
    if (fs.existsSync(STATS_PATH)) {
      try {
        detailedStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'))
      } catch (e) {}
    }
    if (fs.existsSync(COMPARISON_PATH)) {
      try {
        comparisons = JSON.parse(fs.readFileSync(COMPARISON_PATH, 'utf8'))
      } catch (e) {}
    }
    if (fs.existsSync(EXPORTS_STATS_PATH)) {
      try {
        exportsStats = JSON.parse(fs.readFileSync(EXPORTS_STATS_PATH, 'utf8'))
      } catch (e) {}
    }
    if (fs.existsSync(EXPORTS_COMPARISON_PATH)) {
      try {
        exportsComparisons = JSON.parse(
          fs.readFileSync(EXPORTS_COMPARISON_PATH, 'utf8')
        )
      } catch (e) {}
    }
  }

  // If we are filtering by package and requested a reset, clear pertinent data only
  if (shouldReset && packageFilter) {
    console.log(`Clearing existing data for package: ${packageFilter}`)
    // Clean Sets
    const keysToRemove = []
    progress.completed.forEach(key => {
      if (key.startsWith(packageFilter + '@')) keysToRemove.push(key)
    })
    progress.completed_exports.forEach(key => {
      if (key.startsWith(packageFilter + '@')) keysToRemove.push(key)
    })
    progress.failed.forEach(key => {
      if (key.startsWith(packageFilter + '@')) keysToRemove.push(key)
    })

    keysToRemove.forEach(key => {
      progress.completed.delete(key)
      progress.completed_exports.delete(key)
      progress.failed.delete(key)
    })

    // Clean Arrays
    detailedStats = detailedStats.filter(
      item => !item.package.startsWith(packageFilter + '@')
    )
    comparisons = comparisons.filter(
      item => !item.package.startsWith(packageFilter + '@')
    )
    exportsStats = exportsStats.filter(
      item => !item.package.startsWith(packageFilter + '@')
    )
    exportsComparisons = exportsComparisons.filter(
      item => !item.package.startsWith(packageFilter + '@')
    )
  }

  console.log('Checking API reachability...')
  // Check API is reachable
  try {
    await axios.get(`${API_BASE}/api/recent?limit=1`, { timeout: 10000 })
    console.log('API is reachable')
  } catch (err) {
    console.error(`Cannot reach API at ${API_BASE}. Error: ${err.message}`)
    console.error('Make sure the server is running.')
    process.exit(1)
  }

  const startTime = Date.now()
  let processed = 0

  console.log('\nStarting builds...\n')

  // Process in batches
  for (let i = 0; i < allVersions.length; i += concurrency) {
    const batch = allVersions.slice(i, i + concurrency)
    console.log(
      `\n[DEBUG] Processing batch ${
        Math.floor(i / concurrency) + 1
      }, packages: ${batch
        .map(b => b.packageName + '@' + b.version)
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

    // Log results
    for (const result of results) {
      const parts = []
      let symbol = '✓'

      if (!result.size && !result.exports) {
        // Skipped completely
        continue
      }

      if (result.size) {
        if (result.size.success) {
          parts.push(`Size: ${(result.size.size / 1024).toFixed(1)}kB`)
        } else {
          symbol = '✗'
          parts.push(`Size: Failed (${result.size.error})`)
        }
      }

      if (result.exports) {
        if (result.exports.success) {
          parts.push(`Exports: OK`)
        } else {
          // Only mark as failure (cross) if exports failed and it wasn't just a missing size failure (which usually cascades)
          if (symbol === '✓') symbol = '⚠'
          parts.push(`Exports: Failed (${result.exports.error})`)
        }
      }

      console.log(
        `${symbol} ${result.key} (${result.duration}s) - ${parts.join(', ')}`
      )
    }

    processed = Math.min(i + concurrency, allVersions.length)
    // ... (rest of stats calculation) ...
    const elapsed = (Date.now() - startTime) / 1000
    const rate = (progress.stats.success + progress.stats.failed) / elapsed
    const remaining = (allVersions.length - processed) / (rate || 1)

    // Progress update
    console.log(
      `\n[${processed}/${allVersions.length}] Sizes (S: ${progress.stats.success}, F: ${progress.stats.failed}), Exports (S: ${progress.stats.exports_success}, F: ${progress.stats.exports_failed}), Skipped: ${progress.stats.skipped}`
    )
    console.log(
      `Elapsed: ${formatTime(elapsed)}, ETA: ${formatTime(remaining)}\n`
    )

    // Save progress after each batch
    saveProgress(progress)
    saveStats(detailedStats)
    saveComparisons(comparisons)
    saveExportsStats(exportsStats)
    saveExportsComparisons(exportsComparisons)
  }

  // Final summary
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

  // Cleanup progress if all done successfully
  if (progress.stats.failed === 0 && progress.stats.success > 0) {
    console.log('\nAll packages built successfully!')
  } else if (progress.stats.failed > 0) {
    console.log(`\n${progress.stats.failed} packages failed. Re-run to retry.`)
  }

  process.exit(0)
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Progress has been saved.')
  process.exit(0)
})

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
