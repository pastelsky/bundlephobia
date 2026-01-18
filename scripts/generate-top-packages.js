/**
 * Script to generate a list of top packages to pre-populate modules-v3
 *
 * This reads from Firebase:
 * - searches-v2: to find popular packages (high count, searched in last 6 months)
 * - modules-v2: to get the latest 20 versions for each package
 *
 * Output: top-packages.json with package name, versions, and priority
 *
 * Features:
 * - Concurrent fetching for speed
 * - Incremental saves to resume from crashes
 * - Proper semver validation (no pre-release/beta versions)
 *
 * Usage: node scripts/generate-top-packages.js
 */

const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')
const semver = require('semver')

// Use the same encoding/decoding as the main app
const { encodeFirebaseKey, decodeFirebaseKey } = require('../utils/index')

// Initialize Firebase Admin
const serviceAccountPath = path.join(
  __dirname,
  './keys/module-cost-firebase-adminsdk-xcnum-ca64ae80ff.json'
)

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    'Firebase service account key not found at:',
    serviceAccountPath
  )
  process.exit(1)
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  databaseURL: 'https://module-cost.firebaseio.com',
})

const db = admin.database()

// Configuration
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000
const MIN_SEARCH_COUNT = 2 // At least searched twice
const MAX_VERSIONS_PER_PACKAGE = 20
const TOP_PACKAGES_LIMIT = 1000 // Top N packages by search count
const CONCURRENCY = 20 // Number of concurrent Firebase requests
const OUTPUT_PATH = path.join(__dirname, '../top-packages.json')
const PROGRESS_PATH = path.join(__dirname, '../top-packages-progress.json')

/**
 * Check if a version is a valid, stable semver version (no pre-release tags)
 */
function isValidStableVersion(version) {
  // Check for prerelease tags in the original version string
  // This catches things like "1.0.0-alpha", "2.0.0-beta.1", "3.0.0-rc.0"
  if (version.includes('-')) {
    return false
  }

  // Clean and validate the version
  const cleaned = semver.valid(semver.coerce(version))
  if (!cleaned) {
    return false
  }

  return true
}

// Load existing progress if available
function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
      console.log(
        `Resuming from progress file: ${data.results.length} packages already processed`
      )
      return data
    } catch (e) {
      console.log('Could not load progress file, starting fresh')
    }
  }
  return { processedNames: new Set(), results: [] }
}

// Save progress incrementally
function saveProgress(processedNames, results) {
  const data = {
    processedNames: Array.from(processedNames),
    results,
    lastSaved: new Date().toISOString(),
  }
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data, null, 2))
}

// Process a batch of packages concurrently
async function processBatch(packages, processedNames, results, topPackages) {
  const promises = packages.map(async pkg => {
    if (processedNames.has(pkg.name)) {
      return null // Already processed
    }

    try {
      const versionsSnapshot = await db
        .ref('modules-v2')
        .child(pkg.encodedName)
        .once('value')

      const versionsData = versionsSnapshot.val()

      if (versionsData) {
        // Get all versions, decode them, and filter for valid stable versions
        const allVersions = Object.keys(versionsData)
          .map(v => decodeFirebaseKey(v))
          .filter(v => isValidStableVersion(v))

        if (allVersions.length === 0) {
          return null // No valid stable versions
        }

        // Sort by semver (descending - newest first)
        allVersions.sort((a, b) => {
          const cleanA = semver.valid(semver.coerce(a))
          const cleanB = semver.valid(semver.coerce(b))
          if (cleanA && cleanB) {
            return semver.compare(cleanB, cleanA) // descending
          }
          return 0
        })

        // Take latest N versions
        const latestVersions = allVersions.slice(0, MAX_VERSIONS_PER_PACKAGE)

        return {
          name: pkg.name,
          versions: latestVersions,
          searchCount: pkg.count,
          lastSearched: new Date(pkg.lastSearched).toISOString(),
          priority: topPackages.findIndex(p => p.name === pkg.name) + 1, // 1-based priority
        }
      }
      return null
    } catch (err) {
      console.error(`Error processing package ${pkg.name}:`, err.message)
      return null
    }
  })

  const batchResults = await Promise.all(promises)
  return batchResults.filter(r => r !== null)
}

async function main() {
  console.log('Fetching searches-v2 data...')

  const sixMonthsAgo = Date.now() - SIX_MONTHS_MS

  // Fetch all searches
  const searchesSnapshot = await db.ref('searches-v2').once('value')
  const searchesData = searchesSnapshot.val()

  if (!searchesData) {
    console.error('No searches data found')
    process.exit(1)
  }

  console.log(
    `Found ${Object.keys(searchesData).length} total packages in searches-v2`
  )

  // Filter packages: searched at least MIN_SEARCH_COUNT times AND within last 6 months
  const eligiblePackages = []

  for (const [encodedName, data] of Object.entries(searchesData)) {
    const { count, lastSearched } = data

    if (count >= MIN_SEARCH_COUNT && lastSearched >= sixMonthsAgo) {
      eligiblePackages.push({
        encodedName,
        name: decodeFirebaseKey(encodedName),
        count,
        lastSearched,
      })
    }
  }

  console.log(
    `Found ${eligiblePackages.length} eligible packages (count >= ${MIN_SEARCH_COUNT}, searched in last 6 months)`
  )

  // Sort by count (descending) and take top N
  eligiblePackages.sort((a, b) => b.count - a.count)
  const topPackages = eligiblePackages.slice(0, TOP_PACKAGES_LIMIT)

  console.log(
    `Processing top ${topPackages.length} packages with concurrency ${CONCURRENCY}...`
  )

  // Load existing progress
  const progress = loadProgress()
  const processedNames = new Set(progress.processedNames || [])
  const results = progress.results || []

  // Process in batches
  let processed = processedNames.size

  for (let i = 0; i < topPackages.length; i += CONCURRENCY) {
    const batch = topPackages.slice(i, i + CONCURRENCY)
    const unprocessedBatch = batch.filter(p => !processedNames.has(p.name))

    if (unprocessedBatch.length === 0) {
      continue // All already processed
    }

    const batchResults = await processBatch(
      unprocessedBatch,
      processedNames,
      results,
      topPackages
    )

    // Add results and mark as processed
    for (const result of batchResults) {
      results.push(result)
      processedNames.add(result.name)
    }

    // Also mark failed ones as processed to avoid retrying
    for (const pkg of unprocessedBatch) {
      processedNames.add(pkg.name)
    }

    processed = processedNames.size
    console.log(
      `Processed ${processed}/${topPackages.length} packages (${results.length} with valid versions)`
    )

    // Save progress after each batch
    saveProgress(processedNames, results)
  }

  console.log(
    `\nCompleted! Found ${results.length} packages with valid stable versions`
  )

  // Sort results by priority
  results.sort((a, b) => a.priority - b.priority)

  // Write final output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2))
  console.log(`Written to ${OUTPUT_PATH}`)

  // Cleanup progress file
  if (fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH)
    console.log('Cleaned up progress file')
  }

  // Print summary
  console.log('\n=== Summary ===')
  console.log(`Total packages: ${results.length}`)
  console.log(
    `Total versions: ${results.reduce((sum, p) => sum + p.versions.length, 0)}`
  )
  console.log('\nTop 10 packages by search count:')
  results.slice(0, 10).forEach((pkg, i) => {
    console.log(
      `  ${i + 1}. ${pkg.name} (${pkg.searchCount} searches, ${
        pkg.versions.length
      } versions)`
    )
    console.log(`     Latest versions: ${pkg.versions.slice(0, 5).join(', ')}`)
  })

  // Cleanup
  await admin.app().delete()
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
