import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import Router from '@koa/router'
import cacheControl from 'koa-cache-control'

import { createRecentSearchesController } from '../server/controllers/recent-searches.controller'
import { createPackageHistoryController } from '../server/controllers/package-history.controller'
import { createTrendsController } from '../server/controllers/trends.controller'
import type { fetchPackageHistory } from '../server/services/package-history.service'
import type { buildTrendsResponse } from '../server/services/trends.service'
import firebaseUtils from '../utils/firebase.utils'

const readHistory = jest.fn<typeof fetchPackageHistory>()

const readTrends = jest.fn<typeof buildTrendsResponse>()

let server: Server

let baseURL: string

function recoverUpstreams() {
  jest.mocked(firebaseUtils.getRecentSearches).mockResolvedValue({})
  readHistory.mockResolvedValue({
    name: 'example',
    repository: null,
    versions: [],
    releases: [],
    range: { from: null, to: null },
  })
  readTrends.mockResolvedValue({
    packages: [],
    range: 'last-year',
    generatedAt: '2026-10-25T00:00:00Z',
  })
}

beforeAll(async () => {
  const app = new Koa()
  const router = new Router()

  app.use(cacheControl())
  router.get('/api/recent', createRecentSearchesController())
  router.get(
    '/api/package-history',
    createPackageHistoryController(readHistory),
  )
  router.get('/api/trends', createTrendsController(readTrends))
  app.use(router.routes())
  server = createServer(app.callback())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  // SAFETY: this server was bound to a TCP port above.
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
  jest.spyOn(firebaseUtils, 'getRecentSearches')
})

afterEach(() => jest.restoreAllMocks())

it.each([
  ['/api/recent?limit=5', 1200],
  ['/api/package-history?package=example', 3600],
  ['/api/trends?packages=example&range=last-year', 1800],
])(
  'prevents caching transient failures but preserves successful %s responses',
  async (path, ttl) => {
    const error = new Error('upstream unavailable')

    jest.mocked(firebaseUtils.getRecentSearches).mockRejectedValue(error)
    readHistory.mockRejectedValue(error)
    readTrends.mockRejectedValue(error)

    const failed = await fetch(baseURL + path)

    expect(failed.status).toBe(422)
    expect(failed.headers.get('cache-control')).toContain('no-store')
    expect(await failed.json()).toMatchObject({
      message: 'upstream unavailable',
    })
    recoverUpstreams()

    const recovered = await fetch(baseURL + path)

    expect(recovered.status).toBe(200)
    expect(recovered.headers.get('cache-control')).toBe(`max-age=${ttl}`)
    expect(recovered.headers.get('content-type')).toContain('application/json')
    expect(await recovered.json()).not.toHaveProperty('error')
  },
)
