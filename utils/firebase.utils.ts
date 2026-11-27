import axios from 'axios'
import createDebug from 'debug'
import firebaseSDK from 'firebase/app'
import 'firebase/database'
import semver from 'semver'

import type { PackageBuildInfoSnapshot } from '@bundlephobia/service-contracts/package'
import { decodeFirebaseKey, encodeFirebaseKey } from './index'

const debug = createDebug('bp:firebase-util')

const FIREBASE_READ_KEY = process.env.FIREBASE_READ_KEY || 'modules-v3'

if (process.env.FIREBASE_DATABASE_URL && !firebaseSDK.apps.length) {
  firebaseSDK.initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  })
}

export interface SearchRecord {
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

    interface SearchUpdatePayload {
      lastSearched: number
      name: string
      count: object
      version?: string
    }

    const payload: SearchUpdatePayload = {
      lastSearched: Date.now(),
      name: packageInfo.name,
      count: firebaseSDK.database.ServerValue.increment(1),
    }

    if (packageInfo.version !== undefined) {
      payload.version = packageInfo.version
    }

    void searches
      .child(encodeFirebaseKey(name))
      .update(payload)
      .catch(error => console.log(error))
  }

  async getPackageHistory(
    name: string,
    limit = 15,
    includeVersion: (version: string) => boolean = () => true,
  ): Promise<PackageHistory> {
    if (!this.firebase) {
      return {}
    }

    debug('package history %s', name)

    const pkgRef = this.firebase
      .database()
      .ref()
      .child(FIREBASE_READ_KEY)
      .child(encodeFirebaseKey(name))

    try {
      const yarnInfo = await axios.get<AlgoliaPackageResponse>(
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

      const allVersions = Object.keys({
        [yarnInfo.data.version]: '',
        ...yarnInfo.data.versions,
      })

      const limitedVersions = selectPackageHistoryVersions(
        allVersions,
        limit,
        includeVersion,
      )

      debug('last npm %d %s versions %o', limit, name, limitedVersions)

      const entries = await Promise.all(
        limitedVersions.map(async version => {
          const snapshot = await pkgRef
            .child(encodeFirebaseKey(version))
            .once('value')

          // SAFETY: Firebase modules-v3 stores PackageBuildInfoSnapshot entries per version.
          const snapshotValue =
            snapshot.val() as PackageBuildInfoSnapshot | null

          return [version, snapshotValue ?? {}] as const
        }),
      )

      return Object.fromEntries(entries)
    } catch (error) {
      console.error(error)
      const snapshot = await pkgRef.once('value')

      // SAFETY: modules-v3 package nodes map encoded version keys to PackageBuildInfoSnapshot.
      const firebaseHistory = snapshot.val() as PackageHistory | null

      const versions = Object.keys(firebaseHistory || {}).map(version =>
        decodeFirebaseKey(version),
      )

      const limitedVersions = selectPackageHistoryVersions(
        versions,
        limit,
        includeVersion,
      )

      const packageHistory: PackageHistory = {}

      limitedVersions.forEach(version => {
        packageHistory[version] =
          firebaseHistory?.[encodeFirebaseKey(version)] ?? {}
      })

      return packageHistory
    }
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
