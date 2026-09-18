#!/usr/bin/env node

import debugFactory from 'debug'
import firebase from 'firebase'
import GithubAPI from 'github'
import fetch from 'node-fetch'
import trending from 'trending-github'

import firebaseUtils from '../utils/firebase.utils'
import type { PackageHistoryResponse } from '../types/package-history'

import 'dotenv/config'

type SearchCountMap = Record<string, { count: number }>

async function runSerial<T>(tasks: Array<() => Promise<T>>) {
  const results: T[] = []

  for (const task of tasks) {
    results.push(await task())
  }

  return results
}

const debug = debugFactory('bp:trending-fetch')

const github = new GithubAPI({ debug: false })

github.authenticate({
  type: 'oauth',
  key: process.env.GITHUB_CLIENT_ID || '',
  secret: process.env.GITHUB_CLIENT_SECRET || '',
})

firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
})

const port = process.env.PORT || 5000

async function getPackageFromRepo(author: string, name: string) {
  // SAFETY: GitHub's package.json content response is narrowed to its documented fields.
  const response = (await github.repos.getContent({
    repo: author,
    owner: name,
    path: 'package.json',
  })) as { data: { content?: string } }

  if (response.data.content) {
    const decodedContent = Buffer.from(response.data.content, 'base64').toString(
      'utf8'
    )

    // SAFETY: package.json content is expected to contain a string package name.
    return JSON.parse(decodedContent).name as string
  }
}

async function getGithubTrendingPackages() {
  // SAFETY: the trending-github adapter returns repository summaries with these fields.
  const repos = (await trending('daily', 'javascript')) as Array<{
    author: string
    name: string
  }>

  const packages = await Promise.all(
    repos.map(repo => getPackageFromRepo(repo.author, repo.name))
  )

  // SAFETY: the filter removes the undefined results from getPackageFromRepo.
  return packages.filter(Boolean) as string[]
}

async function getTrendingSearches() {
  const limit = 20
  let trendingSearches: string[] = []
  // SAFETY: the Firebase search endpoint returns the SearchCountMap contract.
  const searches = (await firebaseUtils.getDailySearches()) as SearchCountMap | null

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

async function getVersionsToBuild(name: string) {
  const versionsToBuild: string[] = []

  const res = await fetch(
    `http://localhost:${port}/api/package-history?package=${name}`
  )

  // SAFETY: the local package-history endpoint returns PackageHistoryResponse.
  const versionInfo = (await res.json()) as PackageHistoryResponse

  versionInfo.versions.forEach(version => {
    if (!version.built) versionsToBuild.push(version.version)
  })

  return versionsToBuild
}

async function buildPackage(name: string, version: string) {
  debug('building package %s %s', name, version)

  const res = await fetch(
    `http://localhost:${port}/api/size?package=${name + '@' + version}`
  )

  debug('result %s %s %O', name, version, await res.json())
}

async function buildPackageFromGithub(name: string, author: string) {
  debug('building repo %s', name)
  const packageName = await getPackageFromRepo(name, author)

  if (packageName) {
    const versions = await getVersionsToBuild(packageName)
    debug('versions to build for %s — %o', packageName, versions)
    await runSerial(
      versions.map(version => () => buildPackage(packageName, version))
    )
  } else {
    debug('skipped repo %s', name)
  }
}

async function mostPopuplarGithubRepos() {
  // SAFETY: GitHub search results are narrowed to the fields consumed below.
  const repos = (await github.search.repos({
    q: 'language:javascript+npm in:readme+size:1000..50000+mirror:false',
    sort: 'stars',
    page: 1,
    per_page: 10,
  })) as { data: { items: Array<{ name: string; owner: { login: string } }> } }

  debug(
    'Popular GitHub Repos %o',
    repos.data.items.map(r => r.name)
  )

  try {
    const promises = repos.data.items.map(({ name, owner }) => () =>
      buildPackageFromGithub(name, owner.login)
    )

    await runSerial(promises)
  } catch (err) {
    console.log(err)
  }
}

async function updateHistoricalData() {
  try {
    const [githubTrendingPackages, searchTrendingPackages] = await Promise.all([
      getGithubTrendingPackages(),
      getTrendingSearches(),
    ])

    const popularPackages = Array.from(
      new Set(githubTrendingPackages.concat(searchTrendingPackages))
    )

    console.log('popular', popularPackages)
  } catch (err) {
    console.log(err)
  }
}

updateHistoricalData().then(() => mostPopuplarGithubRepos())

export {}
