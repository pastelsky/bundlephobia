const { decodeFirebaseKey, encodeFirebaseKey } = require('./index')
const semver = require('semver')
const fetch = require('node-fetch')
const axios = require('axios')
const firebase = require('firebase')
const debug = require('debug')('bp:firebase-util')

if (process.env.FIREBASE_DATABASE_URL) {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  }

  firebase.initializeApp(firebaseConfig)
}

class FirebaseUtils {
  constructor(firebaseInstance, enable = true) {
    if (enable) {
      this.firebase = firebaseInstance
    }
  }

  setRecentSearch(name, packageInfo) {
    if (!this.firebase) {
      return
    }

    const searches = this.firebase.database().ref().child('searches-v2')
    searches
      .child(encodeFirebaseKey(name))
      .once('value')
      .then(snapshot => snapshot.val())
      .then(res => {
        if (res) {
          return searches
            .child(encodeFirebaseKey(name))
            .update({
              lastSearched: new Date().getTime(),
              name: packageInfo.name,
              count: res.count + 1,
            })
            .catch(err => console.log(err))
        } else {
          return searches
            .child(encodeFirebaseKey(name))
            .set({
              lastSearched: new Date().getTime(),
              name: packageInfo.name,
              version: packageInfo.version,
              count: 1,
            })
            .catch(err => console.log(err))
        }
      })
  }

  async getPackageHistory(name, limit = 15) {
    if (!this.firebase) {
      return {}
    }

    debug('package history %s', name)
    const packageHistory = {}
    const ref = this.firebase
      .database()
      .ref()
      .child('modules-v2')
      .child(encodeFirebaseKey(name))

    const firebasePromise = ref.once('value').then(snapshot => snapshot.val())
    const yarnPromise = axios.get(
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

    let firebaseHistory, versions
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
    } catch (err) {
      console.error(err)
      firebaseHistory = await firebasePromise
      versions = Object.keys(firebaseHistory).map(version =>
        decodeFirebaseKey(version)
      )
    }

    const filteredVersions = versions
      // We *may not* want all tagged alpha/beta versions
      .filter(version => !version.includes('-'))
      .sort((versionA, versionB) => semver.compare(versionA, versionB))

    const limitedVersions = filteredVersions.splice(
      filteredVersions.length - limit
    )
    debug('last npm  %d %s versions %o', limit, name, limitedVersions)

    // Although if the most recent version is tagged,
    // including it might be of interest
    if (versions[versions.length - 1].includes('-')) {
      limitedVersions.shift()
      limitedVersions.push(versions[versions.length - 1])
    }

    limitedVersions.forEach(version => {
      packageHistory[version] = {}
    })

    if (!firebaseHistory) {
      return packageHistory
    }

    debug('searched history %s %o', name, Object.keys(firebaseHistory))
    Object.keys(firebaseHistory).forEach(version => {
      const decodedVersion = decodeFirebaseKey(version)
      if (limitedVersions.includes(decodedVersion)) {
        packageHistory[decodedVersion] = firebaseHistory[version]
      }
    })
    return packageHistory
  }

  getRecentSearches(limit = 10) {
    if (!this.firebase) {
      return {}
    }

    const searches = this.firebase.database().ref().child('searches-v2')
    const recentSearches = {}

    return searches
      .orderByChild('lastSearched')
      .limitToLast(Number(limit))
      .once('value')
      .then(snapshot => snapshot.val())
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

  async getDailySearches() {
    if (!this.firebase) {
      return {}
    }

    const dailySearches = {}
    const searches = this.firebase.database().ref().child('searches-v2')

    const snapshot = await searches
      .orderByChild('lastSearched')
      .startAt(Date.now() - 1000 * 60 * 60 * 24 * 4, 'lastSearched')
      .once('value')
    const packages = snapshot.val()

    if (packages) {
      Object.keys(packages).forEach(packageName => {
        dailySearches[decodeFirebaseKey(packageName)] = packages[packageName]
      })
    }
    return dailySearches
  }
}

module.exports = new FirebaseUtils(
  firebase,
  !!process.env.FIREBASE_DATABASE_URL
)
