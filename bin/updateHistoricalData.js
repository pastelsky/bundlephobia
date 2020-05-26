#!/usr/bin/env node

const firebase = require('firebase')
const FirebaseUtils = require('../utils/firebase.utils')
const trending = require('trending-github')
const fetch = require('node-fetch')
const debug = require('debug')('bp:trending-fetch')
const GithubAPI = require('github')
const isEmptyObject = require('is-empty-object')
const promiseSeries = require('promise.series')

require('dotenv').config()

const github = new GithubAPI({
  debug: false,
})

github.authenticate({
  type: 'oauth',
  key: process.env.GITHUB_CLIENT_ID,
  secret: process.env.GITHUB_CLIENT_SECRET,
})

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

const firebaseUtils = new FirebaseUtils(firebase)
const port = process.env.PORT || 5000

async function getPackageFromRepo(author, name) {
  const {
    data: { content },
  } = await github.repos.getContent({
    repo: author,
    owner: name,
    path: 'package.json',
  })

  if (content) {
    const decodedContent = Buffer.from(content, 'base64').toString('utf8')
    return JSON.parse(decodedContent).name
  }
}

async function getGithubTrendingPackages() {
  const repos = await trending('daily', 'javascript')
  const packages = await Promise.all(
    repos.map(repo => getPackageFromRepo(repo.author, repo.name))
  )
  return packages.filter(pack => pack)
}

async function getTrendingSearches() {
  const limit = 20
  let trendingSearches = []
  const searches = await firebaseUtils.getDailySearches()

  if (searches) {
    trendingSearches = Object.keys(searches)
      .sort(
        (packageA, packageB) =>
          searches[packageB].count - searches[packageA].count
      )
      .slice(0, limit)
  }

  return trendingSearches
}

async function updateHistoricalData() {
  try {
    const [githubTrendingPackages, searchTrendingPackages] = await Promise.all([
      getGithubTrendingPackages(),
      getTrendingSearches(),
    ])

    const popularPackages = [
      ...new Set(githubTrendingPackages.concat(searchTrendingPackages)),
    ]
    console.log('popular', popularPackages)
  } catch (err) {
    console.log(err)
  }
}

async function getVersionsToBuild(name) {
  const versionsToBuild = []
  const res = await fetch(
    `http://localhost:${port}/api/package-history?package=${name}`
  )
  const versionInfo = await res.json()

  Object.keys(versionInfo).forEach(version => {
    if (isEmptyObject(versionInfo[version])) {
      versionsToBuild.push(version)
    }
  })

  return versionsToBuild
}

async function getVersionsToBuild(name) {
  const versionsToBuild = []
  const res = await fetch(
    `http://localhost:${port}/api/package-history?package=${name}`
  )
  const versionInfo = await res.json()

  Object.keys(versionInfo).forEach(version => {
    if (isEmptyObject(versionInfo[version])) {
      versionsToBuild.push(version)
    }
  })

  return versionsToBuild
}

async function buildPackage(name, version) {
  debug('building package %s %s', name, version)
  const versionsToBuild = []
  const res = await fetch(
    `http://localhost:${port}/api/size?package=${name + '@' + version}`
  )
  debug('result %s %s %O', name, version, await res.json())
}

async function buildPackageFromGithub(name, author) {
  debug('building repo %s', name)
  const packageName = await getPackageFromRepo(name, author)

  if (packageName) {
    const versions = await getVersionsToBuild(packageName)
    debug('versions to build for %s — %o', packageName, versions)
    await promiseSeries(
      versions.map(version => () => buildPackage(packageName, version))
    )
  } else {
    debug('skipped repo %s', name)
  }
}

async function mostPopuplarGithubRepos() {
  const repos = await github.search.repos({
    q: 'language:javascript+npm in:readme+size:1000..50000+mirror:false',
    sort: 'stars',
    page: 1,
    per_page: 10,
  })

  debug(
    'Popular GitHub Repos %o',
    repos.data.items.map(r => r.name)
  )

  try {
    const promises = repos.data.items.map(({ name, owner }) => () =>
      buildPackageFromGithub(name, owner.login)
    )
    await promiseSeries(promises)
  } catch (err) {
    console.log(err)
  }
}

mostPopuplarGithubRepos()
