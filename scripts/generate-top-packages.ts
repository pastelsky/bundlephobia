import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'
import semver from 'semver'

import { decodeFirebaseKey } from '../utils/index'

type SearchRecord = {
  count: number
  lastSearched: number
}

type EligiblePackage = {
  encodedName: string
  name: string
  count: number
  lastSearched: number
}

type TopPackage = {
  name: string
  versions: string[]
  searchCount: number
  lastSearched: string
  priority: number
}

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
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000
const MIN_SEARCH_COUNT = 2
const MAX_VERSIONS_PER_PACKAGE = 20
const TOP_PACKAGES_LIMIT = 1000
const CONCURRENCY = 20
const OUTPUT_PATH = path.join(__dirname, '../top-packages.json')
const PROGRESS_PATH = path.join(__dirname, '../top-packages-progress.json')

function isValidStableVersion(version: string) {
  if (version.includes('-')) {
    return false
  }

  const cleaned = semver.valid(semver.coerce(version))
  return Boolean(cleaned)
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) as {
        processedNames: string[]
        results: TopPackage[]
      }
      console.log(
        `Resuming from progress file: ${data.results.length} packages already processed`
      )
      return data
    } catch {
      console.log('Could not load progress file, starting fresh')
    }
  }

  return { processedNames: [] as string[], results: [] as TopPackage[] }
}

function saveProgress(processedNames: Set<string>, results: TopPackage[]) {
  const data = {
    processedNames: Array.from(processedNames),
    results,
    lastSaved: new Date().toISOString(),
  }
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data, null, 2))
}

async function processBatch(
  packages: EligiblePackage[],
  processedNames: Set<string>,
  topPackages: EligiblePackage[]
) {
  const promises = packages.map(async pkg => {
    if (processedNames.has(pkg.name)) {
      return null
    }

    try {
      const versionsSnapshot = await db
        .ref('modules-v2')
        .child(pkg.encodedName)
        .once('value')

      const versionsData = versionsSnapshot.val() as Record<
        string,
        unknown
      > | null

      if (versionsData) {
        const allVersions = Object.keys(versionsData)
          .map(v => decodeFirebaseKey(v))
          .filter(v => isValidStableVersion(v))

        if (allVersions.length === 0) {
          return null
        }

        allVersions.sort((a, b) => {
          const cleanA = semver.valid(semver.coerce(a))
          const cleanB = semver.valid(semver.coerce(b))
          if (cleanA && cleanB) {
            return semver.compare(cleanB, cleanA)
          }
          return 0
        })

        return {
          name: pkg.name,
          versions: allVersions.slice(0, MAX_VERSIONS_PER_PACKAGE),
          searchCount: pkg.count,
          lastSearched: new Date(pkg.lastSearched).toISOString(),
          priority: topPackages.findIndex(p => p.name === pkg.name) + 1,
        } satisfies TopPackage
      }

      return null
    } catch (err) {
      console.error(
        `Error processing package ${pkg.name}:`,
        (err as Error).message
      )
      return null
    }
  })

  const batchResults = await Promise.all(promises)
  return batchResults.filter((result): result is TopPackage => result !== null)
}

async function main() {
  console.log('Fetching searches-v2 data...')

  const sixMonthsAgo = Date.now() - SIX_MONTHS_MS
  const searchesSnapshot = await db.ref('searches-v2').once('value')
  const searchesData = searchesSnapshot.val() as Record<
    string,
    SearchRecord
  > | null

  if (!searchesData) {
    console.error('No searches data found')
    process.exit(1)
  }

  console.log(
    `Found ${Object.keys(searchesData).length} total packages in searches-v2`
  )

  const eligiblePackages: EligiblePackage[] = []

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

  eligiblePackages.sort((a, b) => b.count - a.count)
  const topPackages = eligiblePackages.slice(0, TOP_PACKAGES_LIMIT)
  console.log(
    `Processing top ${topPackages.length} packages with concurrency ${CONCURRENCY}...`
  )

  const progress = loadProgress()
  const processedNames = new Set(progress.processedNames || [])
  const results = progress.results || []

  for (let i = 0; i < topPackages.length; i += CONCURRENCY) {
    const batch = topPackages.slice(i, i + CONCURRENCY)
    const unprocessedBatch = batch.filter(p => !processedNames.has(p.name))

    if (unprocessedBatch.length === 0) {
      continue
    }

    const batchResults = await processBatch(
      unprocessedBatch,
      processedNames,
      topPackages
    )

    for (const result of batchResults) {
      results.push(result)
      processedNames.add(result.name)
    }

    for (const pkg of unprocessedBatch) {
      processedNames.add(pkg.name)
    }

    console.log(
      `Processed ${processedNames.size}/${topPackages.length} packages (${results.length} with valid versions)`
    )
    saveProgress(processedNames, results)
  }

  results.sort((a, b) => a.priority - b.priority)
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2))
  console.log(`Written to ${OUTPUT_PATH}`)

  if (fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH)
    console.log('Cleaned up progress file')
  }

  await admin.app().delete()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

export {}
