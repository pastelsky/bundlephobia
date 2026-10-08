import axios from 'axios'
import createDebug from 'debug'
import firebaseSDK from 'firebase'
import semver from 'semver'

import type { PackageBuildInfoSnapshot } from '@bundlephobia/service-contracts/package'
import { normalizeEntryPoint } from '@bundlephobia/service-contracts/package'
import { cacheStoragePath } from '@bundlephobia/service-contracts/cache'
import { decodeFirebaseKey, encodeFirebaseKey } from './index'

const debug = createDebug('bp:firebase-util')

const FIREBASE_READ_KEY = process.env.FIREBASE_READ_KEY || 'modules-v2'

if (process.env.FIREBASE_DATABASE_URL && !firebaseSDK.apps.length) {
  firebaseSDK.initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  })
}

interface SearchRecord {
  lastSearched: number
  name: string
  version?: string
  count: number
}

type PackageHistory = Record<string, PackageBuildInfoSnapshot>

interface AlgoliaPackageResponse {
  version: string
  versions: Record<string, string>
}

async function readPackageHistoryWithFallback(
  getHistoryFromKey: (key: string) => Promise<PackageHistory | null>,
  entryPoint?: string,
): Promise<PackageHistory | null> {
  const result = await getHistoryFromKey(FIREBASE_READ_KEY)

  if (result) {
    debug('package history from %s', FIREBASE_READ_KEY)

    return result
  }

  if (
    entryPoint ||
    FIREBASE_READ_KEY !== 'modules-v3' ||
    process.env.DISABLE_FIREBASE_V2_FALLBACK
  ) {
    return null
  }

  const fallback = await getHistoryFromKey('modules-v2')

  if (fallback) {
    debug('package history from modules-v2 (fallback)')
  }

  return fallback
}

function selectPackageHistoryVersions(
  versions: string[],
  limit: number,
  includeVersion: (version: string) => boolean,
): string[] {
  const filteredVersions = versions
    .filter(includeVersion)
    .filter(version => !version.includes('-'))
    .sort((versionA, versionB) => semver.compare(versionA, versionB))

  const limitedVersions = filteredVersions.slice(
    Math.max(filteredVersions.length - limit, 0),
  )

  const latestVersion = versions.filter(includeVersion).at(-1)

  if (latestVersion?.includes('-')) {
    limitedVersions.shift()
    limitedVersions.push(latestVersion)
  }

  return limitedVersions
}

function selectBuiltHistory(
  history: PackageHistory | null,
  limit: number,
  includeVersion: (version: string) => boolean,
): PackageHistory {
  const snapshots = history ?? {}
  const versions = Object.keys(snapshots).map(decodeFirebaseKey)

  return Object.fromEntries(
    selectPackageHistoryVersions(versions, limit, includeVersion).map(
      version => [version, snapshots[encodeFirebaseKey(version)]],
    ),
  )
}

class FirebaseUtils {
  private readonly firebase?: typeof firebaseSDK

  constructor(firebaseInstance: typeof firebaseSDK, enable = true) {
    if (enable) {
      this.firebase = firebaseInstance
    }
  }

  setRecentSearch(
    name: string,
    packageInfo: { name: string; version?: string },
  ): void {
    if (!this.firebase) {
      return
    }

    const searches = this.firebase.database().ref().child('searches-v2')
    void searches
      .child(encodeFirebaseKey(name))
      .once('value')
      .then(snapshot => {
        // SAFETY: searches-v2 values are written as SearchRecord entries.
        return snapshot.val() as SearchRecord | null
      })
      .then(result => {
        if (result) {
          return searches.child(encodeFirebaseKey(name)).update({
            lastSearched: Date.now(),
            name: packageInfo.name,
            count: result.count + 1,
          })
        }

        return searches.child(encodeFirebaseKey(name)).set({
          lastSearched: Date.now(),
          name: packageInfo.name,
          version: packageInfo.version,
          count: 1,
        })
      })
      .catch(error => console.log(error))
  }

  async getPackageHistory(
    name: string,
    limit = 15,
    {
      includeVersion = () => true,
      entryPoint: selectedEntryPoint,
    }: {
      includeVersion?: (version: string) => boolean
      entryPoint?: string
    } = {},
  ): Promise<PackageHistory> {
    if (!this.firebase) {
      return {}
    }

    debug('package history %s', name)
    const packageHistory: PackageHistory = {}
    const firebase = this.firebase
    const entryPoint = normalizeEntryPoint(selectedEntryPoint)

    const getHistoryFromKey = async (key: string) => {
      const ref = firebase
        .database()
        .ref()
        .child(cacheStoragePath(key, { name, entryPoint }).join('/'))

      return ref.once('value').then(snapshot => {
        // SAFETY: modules-v2 and modules-v3 history values are package snapshots.
        return snapshot.val() as PackageHistory | null
      })
    }

    const firebasePromise = readPackageHistoryWithFallback(
      getHistoryFromKey,
      entryPoint,
    )

    // Entry-point histories contain only measurements we actually built.
    if (entryPoint) {
      const history = await firebasePromise

      return selectBuiltHistory(history, limit, includeVersion)
    }

    const yarnPromise = axios.get<AlgoliaPackageResponse>(
      `https://${
        process.env.ALGOLIA_APP_ID
      }-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(name)}`,
      {
        params: {
          'x-algolia-agent': 'bundlephobia',
          'x-algolia-application-id': process.env.ALGOLIA_APP_ID,
          'x-algolia-api-key': process.env.ALGOLIA_API_KEY,
        },
      },
    )

    let firebaseHistory: PackageHistory | null
    let versions: string[]

    try {
      const [firebaseResult, yarnInfo] = await Promise.all([
        firebasePromise,
        yarnPromise,
      ])

      firebaseHistory = firebaseResult
      yarnInfo.data.versions = {
        [yarnInfo.data.version]: '',
        ...yarnInfo.data.versions,
      }
      versions = Object.keys(yarnInfo.data.versions)
    } catch (error) {
      console.error(error)

      return selectBuiltHistory(await firebasePromise, limit, includeVersion)
    }

    const limitedVersions = selectPackageHistoryVersions(
      versions,
      limit,
      includeVersion,
    )

    debug('last npm %d %s versions %o', limit, name, limitedVersions)

    limitedVersions.forEach(version => {
      packageHistory[version] = {}
    })

    if (!firebaseHistory) {
      return packageHistory
    }

    Object.keys(firebaseHistory).forEach(version => {
      const decodedVersion = decodeFirebaseKey(version)

      if (limitedVersions.includes(decodedVersion)) {
        packageHistory[decodedVersion] = firebaseHistory?.[version] ?? {}
      }
    })

    return packageHistory
  }

  getRecentSearches(limit = 10): Promise<Record<string, SearchRecord>> | {} {
    if (!this.firebase) {
      return {}
    }

    const searches = this.firebase.database().ref().child('searches-v2')
    const recentSearches: Record<string, SearchRecord> = {}

    return searches
      .orderByChild('lastSearched')
      .limitToLast(Number(limit))
      .once('value')
      .then(snapshot => {
        // SAFETY: searches-v2 values are keyed SearchRecord entries.
        return snapshot.val() as Record<string, SearchRecord> | null
      })
      .then(result => {
        if (!result) {
          return recentSearches
        }

        Object.keys(result).forEach(search => {
          recentSearches[decodeFirebaseKey(search)] = result[search]
        })

        return recentSearches
      })
  }

  async getDailySearches(): Promise<Record<string, SearchRecord>> {
    if (!this.firebase) {
      return {}
    }

    const dailySearches: Record<string, SearchRecord> = {}
    const searches = this.firebase.database().ref().child('searches-v2')

    const snapshot = await searches
      .orderByChild('lastSearched')
      .startAt(Date.now() - 1000 * 60 * 60 * 24 * 4, 'lastSearched')
      .once('value')

    // SAFETY: searches-v2 values are keyed SearchRecord entries.
    const packages = snapshot.val() as Record<string, SearchRecord> | null

    if (packages) {
      Object.keys(packages).forEach(packageName => {
        dailySearches[decodeFirebaseKey(packageName)] = packages[packageName]
      })
    }

    return dailySearches
  }
}

const firebaseUtils = new FirebaseUtils(
  firebaseSDK,
  Boolean(process.env.FIREBASE_DATABASE_URL),
)

export default firebaseUtils
