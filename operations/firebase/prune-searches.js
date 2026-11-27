#!/usr/bin/env node

/**
 * Prune stale entries from Firebase RTDB `searches-v2` using the `lastSearched`
 * index in small bounded batches so outgoing bandwidth stays minimal.
 *
 * Usage:
 *   node operations/firebase/prune-searches.js [--dry-run] [--retention-days 360] [--batch-size 500] [--max-batches 200]
 */

const { parseArgs } = require('node:util')

require('dotenv-defaults/config.js')

const firebase = require('firebase/app')

require('firebase/database')

const DEFAULT_RETENTION_DAYS = 360

const DEFAULT_BATCH_SIZE = 500

const DEFAULT_MAX_BATCHES = 200

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parsePositiveInt(value, fallback) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function readCliOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'retention-days': { type: 'string' },
      'batch-size': { type: 'string' },
      'max-batches': { type: 'string' },
    },
  })

  return {
    dryRun: Boolean(values['dry-run']),
    retentionDays: parsePositiveInt(
      values['retention-days'] ?? process.env.FIREBASE_SEARCHES_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
    batchSize: parsePositiveInt(values['batch-size'], DEFAULT_BATCH_SIZE),
    maxBatches: parseNonNegativeInt(values['max-batches'], DEFAULT_MAX_BATCHES),
  }
}

function initFirebase() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL

  if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL is required')
  }

  if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL,
    })
  }

  return firebase.database()
}

async function fetchStaleBatch(searchesRef, cutoffMs, batchSize) {
  const snapshot = await searchesRef
    .orderByChild('lastSearched')
    .endAt(cutoffMs)
    .limitToFirst(batchSize)
    .once('value')

  const entries = snapshot.val()

  if (!entries) return { keys: [], entries: {} }

  return { keys: Object.keys(entries), entries }
}

async function pruneOldSearches(options) {
  const db = initFirebase()
  const searchesRef = db.ref('searches-v2')
  const cutoffMs = Date.now() - options.retentionDays * MS_PER_DAY

  let totalDeleted = 0
  let batches = 0

  while (options.maxBatches === 0 || batches < options.maxBatches) {
    const { keys, entries } = await fetchStaleBatch(
      searchesRef,
      cutoffMs,
      options.batchSize,
    )

    if (keys.length === 0) break

    batches += 1

    if (options.dryRun) {
      totalDeleted += keys.length
      console.log(
        `[dry-run] batch ${batches}: would delete ${keys.length} keys (oldest=${entries[keys[0]]?.lastSearched})`,
      )
      break
    }

    await searchesRef.update(Object.fromEntries(keys.map(key => [key, null])))
    totalDeleted += keys.length

    if (keys.length < options.batchSize) break
  }

  console.log(
    `[firebase-prune] ${options.dryRun ? 'dry-run' : 'pruned'} ${totalDeleted} keys across ${batches} batch(es) (retentionDays=${options.retentionDays}, cutoff=${new Date(cutoffMs).toISOString()})`,
  )
}

async function main() {
  const options = readCliOptions(process.argv.slice(2))

  try {
    await pruneOldSearches(options)
  } finally {
    if (firebase.apps.length) {
      await firebase.app().delete()
    }
  }
}

main().catch(error => {
  console.error('[firebase-prune] failed:', error)
  process.exit(1)
})
