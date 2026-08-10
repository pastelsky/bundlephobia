import 'dotenv-defaults/config.js'

import createDebug from 'debug'
import type { FastifyReply } from 'fastify'
import firebase from 'firebase'
import { LRUCache } from 'lru-cache'

import { encodeFirebaseKey } from '../cache.utils.ts'
import { readCacheSnapshot } from '../types.ts'
import type {
  CacheEntry,
  CacheKey,
  CacheRequest,
  CacheRequestBody,
} from '../types.ts'

const debug = createDebug('bp:cache')
const memoryCache = new LRUCache<string, CacheEntry>({ max: 1500 })

// Configurable Firebase keys for read/write operations
const FIREBASE_READ_KEY_EXPORTS =
  process.env.FIREBASE_READ_KEY_EXPORTS || 'exports-v3'
const FIREBASE_WRITE_KEY_EXPORTS =
  process.env.FIREBASE_WRITE_KEY_EXPORTS || 'exports-v3'

debug(
  'Firebase config (exports): READ from %s (with fallback: %s), WRITE to %s',
  FIREBASE_READ_KEY_EXPORTS,
  FIREBASE_READ_KEY_EXPORTS === 'exports-v3' ? 'yes, to exports' : 'no',
  FIREBASE_WRITE_KEY_EXPORTS,
)

async function getPackageResultFromKey(
  key: string,
  { name, version }: CacheKey,
) {
  const ref = firebase
    .database()
    .ref()
    .child(key)
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return readCacheSnapshot<CacheEntry>(snapshot)
}

async function getPackageResult({
  name,
  version,
  readKey,
}: CacheKey & { readKey?: string }) {
  const targetReadKey = readKey || FIREBASE_READ_KEY_EXPORTS
  // Try primary read key first
  const result = await getPackageResultFromKey(targetReadKey, { name, version })

  if (result) {
    debug('cache hit: firebase (%s)', targetReadKey)
    return result
  }

  // If reading from default v3 and not found, fall back to "exports" (v2)
  if (
    targetReadKey === 'exports-v3' &&
    !readKey &&
    !process.env.DISABLE_FIREBASE_V2_FALLBACK
  ) {
    const fallbackResult = await getPackageResultFromKey('exports', {
      name,
      version,
    })
    if (fallbackResult) {
      debug('cache hit: firebase (fallback to exports)')
    }
    return fallbackResult
  }

  return null
}

async function setPackageResult({ name, version, result }: CacheRequestBody) {
  const modules = firebase.database().ref().child(FIREBASE_WRITE_KEY_EXPORTS)
  return modules
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))
    .set(result)
}

export async function getExportsSizeMiddlware(
  req: CacheRequest,
  res: FastifyReply,
) {
  const name = decodeURIComponent(req.query.name)
  const version = decodeURIComponent(req.query.version)
  const readKey = req.query.readKey

  if (!name || !version) {
    return res.code(422).send()
  }
  debug('get exports %s@%s (readKey: %s)', name, version, readKey)

  // Use memory cache only if no explicit readKey is provided
  if (!readKey) {
    const lruCacheEntry = memoryCache.get(`${name}@${version}`)
    if (lruCacheEntry) {
      debug('cache hit: memory')
      return res.code(200).send(lruCacheEntry)
    }
  }

  const result = await getPackageResult({ name, version, readKey })
  if (result) {
    debug('cache hit: firebase')
    if (!readKey) {
      memoryCache.set(`${name}@${version}`, result)
    }
    return res.code(200).send(result)
  }

  return res.code(404).send()
}

export async function postExportsSizeMiddleware(
  req: CacheRequest,
  res: FastifyReply,
) {
  const { name, version, result } = req.body

  if (!name || !version || !result) return res.code(422).send()

  debug('set exports %O to %O', { name, version }, result)
  memoryCache.set(`${name}@${version}`, result)
  try {
    await setPackageResult({ name, version, result })
    return res.code(201).send()
  } catch (error) {
    console.log(error)
    return res.code(500).send({ error })
  }
}
