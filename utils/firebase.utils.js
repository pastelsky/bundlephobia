const { decodeFirebaseKey, encodeFirebaseKey } = require('./index')
const semver = require('semver')
const fetch = require('node-fetch')
const debug = require('debug')('bp:firebase-util')


class FirebaseUtils {
  constructor(firebaseInstance) {
    this.firebase = firebaseInstance
  }

  async getPackageResult({ name, version }) {
    const ref = this.firebase.database().ref()
      .child('modules-v2')
      .child(encodeFirebaseKey(name))
      .child(encodeFirebaseKey(version))

    const snapshot = await ref.once('value')
    return snapshot.val()
  }

  setPackageResult({ name, version }, result) {
    const modules = this.firebase.database().ref().child('modules-v2')
    return modules
      .child(encodeFirebaseKey(name))
      .child(encodeFirebaseKey(version))
      .set(result)
  }

  setRecentSearch(name, packageInfo) {
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
    debug('package history %s', name)
    const packageHistory = {}
    const ref = this.firebase.database().ref()
      .child('modules-v2')
      .child(encodeFirebaseKey(name))
      .limitToLast(limit)

    // Scoped packages have a / which needs to be escaped (but not the @)!
    const normalizedName = name.replace(/\//g, '%2F')
    const response = await fetch(`https://registry.yarnpkg.com/${normalizedName}`)
    const packageInfo = await response.json()
    const versions = Object.keys(packageInfo.versions)


    const filteredVersions = versions
    // We *may not* want all tagged alpha/beta versions
      .filter(version => !version.includes('-'))
      .sort((versionA, versionB) => semver.gte(versionA, versionB))

    const limitedVersions = filteredVersions
      .splice(filteredVersions.length - limit)
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

    return ref
      .once('value')
      .then(snapshot => snapshot.val())
      .then(versionHistory => {
        if (!versionHistory) {
          return packageHistory
        }

        debug('searched history %s %o', name, Object.keys(versionHistory))
        Object.keys(versionHistory).forEach(version => {
          packageHistory[decodeFirebaseKey(version)] = versionHistory[version]
        })
        return packageHistory
      })
  }

  getRecentSearches(limit = 10) {
    const searches = this.firebase.database().ref().child('searches-v2')
    const recentSearches = {}

    return searches
      .orderByChild('lastSearched')
      .limitToLast(limit)
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
    const dailySearches = {}
    const searches = this.firebase.database().ref().child('searches-v2')

    const snapshot = await searches
      .orderByChild('lastSearched')
      .startAt(Date.now() - 1000 * 60 * 60 * 24 * 4, 'lastSearched')
      .once('value')
    const packages = snapshot.val()

    if (packages) {
      Object.keys(packages)
        .forEach(packageName => {
          dailySearches[decodeFirebaseKey(packageName)] = packages[packageName]
        })
    }
    return dailySearches
  }
}


module.exports = FirebaseUtils