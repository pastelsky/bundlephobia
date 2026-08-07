import axios from 'axios'
import createDebug from 'debug'
import firebaseSDK from 'firebase'
import semver from 'semver'

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

type PackageHistory = Record<string, Record<string, unknown>>

interface AlgoliaPackageResponse {
  version: string
  versions: Record<string, string>
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
    packageInfo: { name: string; version?: string }
  ): void {
    if (!this.firebase) {
      return
    }

    const searches = this.firebase.database().ref().child('searches-v2')
    void searches
      .child(encodeFirebaseKey(name))
      .once('value')
      .then(snapshot => snapshot.val() as SearchRecord | null)
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

  async getPackageHistory(name: string, limit = 15): Promise<PackageHistory> {
    if (!this.firebase) {
      return {}
    }

    debug('package history %s', name)
    const packageHistory: PackageHistory = {}
    const firebase = this.firebase

    const getHistoryFromKey = async (key: string) => {
      const ref = firebase
        .database()
        .ref()
        .child(key)
        .child(encodeFirebaseKey(name))

      return ref.once('value').then(snapshot => {
        return snapshot.val() as Record<string, Record<string, unknown>> | null
      })
    }

    const firebasePromise = (async () => {
      const result = await getHistoryFromKey(FIREBASE_READ_KEY)
      if (result) {
        debug('package history from %s', FIREBASE_READ_KEY)
        return result
      }

      if (
        FIREBASE_READ_KEY === 'modules-v3' &&
        !process.env.DISABLE_FIREBASE_V2_FALLBACK
      ) {
        const fallback = await getHistoryFromKey('modules-v2')
        if (fallback) {
          debug('package history from modules-v2 (fallback)')
        }
        return fallback
      }

      return null
    })()

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
      }
    )

    let firebaseHistory: Record<string, Record<string, unknown>> | null
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
      firebaseHistory = await firebasePromise
      versions = Object.keys(firebaseHistory || {}).map(version =>
        decodeFirebaseKey(version)
      )
    }

    const filteredVersions = versions
      .filter(version => !version.includes('-'))
      .sort((versionA, versionB) => semver.compare(versionA, versionB))

    const limitedVersions = filteredVersions.slice(
      Math.max(filteredVersions.length - limit, 0)
    )

    debug('last npm %d %s versions %o', limit, name, limitedVersions)

    const latestVersion = versions[versions.length - 1]
    if (latestVersion?.includes('-')) {
      limitedVersions.shift()
      limitedVersions.push(latestVersion)
    }

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
      .then(snapshot => snapshot.val() as Record<string, SearchRecord> | null)
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
  Boolean(process.env.FIREBASE_DATABASE_URL)
)

export default firebaseUtils
