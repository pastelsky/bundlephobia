import 'dotenv-defaults/config.js'

import createFastify from 'fastify'
import firebase from 'firebase'

import type { TrendsCacheName } from '../types/cache-domain.ts'
import {
  getExportsSizeMiddlware,
  postExportsSizeMiddleware,
} from './middlewares/exports-size.middleware.ts'
import {
  getPackageSizeMiddlware,
  postPackageSizeMiddlware,
} from './middlewares/package-size.middleware.ts'
import {
  createDownloadsCache,
  createGithubHistoryCache,
  createGithubSnapshotCache,
  createGithubStarsCache,
  createReleasesCache,
  type DownloadsPayload,
  type GithubRepositoryPayload,
  type GithubStarsPayload,
  type PackagePayload,
} from './middlewares/trends-cache.middleware.ts'

const fastify = createFastify()

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

fastify.get('/package-cache', getPackageSizeMiddlware)
fastify.post('/package-cache', postPackageSizeMiddlware)

fastify.get('/exports-cache', getExportsSizeMiddlware)
fastify.post('/exports-cache', postExportsSizeMiddleware)

const HOUR_MS = 60 * 60 * 1000
const trendsCacheConfig: Record<TrendsCacheName, number> = {
  downloads: 6 * HOUR_MS,
  'github-history': 12 * HOUR_MS,
  'github-stars': 12 * HOUR_MS,
  'github-snapshot': HOUR_MS,
  releases: 6 * HOUR_MS,
}

const downloadsCache = createDownloadsCache(trendsCacheConfig.downloads)
fastify.get<{
  Querystring: DownloadsPayload
  Body: DownloadsPayload
}>('/trends-cache/downloads', downloadsCache.get)
fastify.post<{
  Querystring: DownloadsPayload
  Body: DownloadsPayload
}>('/trends-cache/downloads', downloadsCache.post)

const githubHistoryCache = createGithubHistoryCache(
  trendsCacheConfig['github-history'],
)
fastify.get<{
  Querystring: GithubRepositoryPayload
  Body: GithubRepositoryPayload
}>('/trends-cache/github-history', githubHistoryCache.get)
fastify.post<{
  Querystring: GithubRepositoryPayload
  Body: GithubRepositoryPayload
}>('/trends-cache/github-history', githubHistoryCache.post)

const githubStarsCache = createGithubStarsCache(
  trendsCacheConfig['github-stars'],
)
fastify.get<{
  Querystring: GithubStarsPayload
  Body: GithubStarsPayload
}>('/trends-cache/github-stars', githubStarsCache.get)
fastify.post<{
  Querystring: GithubStarsPayload
  Body: GithubStarsPayload
}>('/trends-cache/github-stars', githubStarsCache.post)

const githubSnapshotCache = createGithubSnapshotCache(
  trendsCacheConfig['github-snapshot'],
)
fastify.get<{
  Querystring: GithubRepositoryPayload
  Body: GithubRepositoryPayload
}>('/trends-cache/github-snapshot', githubSnapshotCache.get)
fastify.post<{
  Querystring: GithubRepositoryPayload
  Body: GithubRepositoryPayload
}>('/trends-cache/github-snapshot', githubSnapshotCache.post)

const releasesCache = createReleasesCache(trendsCacheConfig.releases)
fastify.get<{ Querystring: PackagePayload; Body: PackagePayload }>(
  '/trends-cache/releases',
  releasesCache.get,
)
fastify.post<{ Querystring: PackagePayload; Body: PackagePayload }>(
  '/trends-cache/releases',
  releasesCache.post,
)

fastify
  .listen({ port: 7001 })
  .then(() => {
    const address = fastify.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('cache service did not expose a TCP address')
    }
    console.log(`server listening on ${address.port}`)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
