import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import Koa from 'koa'
import { z } from 'zod'
import serve from 'koa-static'
import statsPathMiddleware from '../server/middlewares/stats-path.middleware'

let root: string

let server: http.Server

let port: number

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-path-'))
  await fs.mkdir(path.join(root, 'stats/dashboard'), { recursive: true })
  await fs.writeFile(path.join(root, 'stats/dashboard/index.html'), 'dashboard')
  await fs.writeFile(path.join(root, 'public-file.txt'), 'public')
  const app = new Koa()
  app.use(statsPathMiddleware)
  app.use(serve(root))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  port = z.object({ port: z.number() }).parse(server.address()).port
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  await fs.rm(root, { recursive: true, force: true })
})

function request(rawPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: rawPath }, response => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
      .on('error', reject)
  })
}

it.each([
  '/%73tats/dashboard/',
  '/stats%2fdashboard/',
  '/%2fstats/dashboard/',
  '/foo/../stats/dashboard/',
  '/foo%2f..%2fstats/dashboard/',
  '/%2e%2e/stats/dashboard/',
  '/stats//dashboard/',
  '//stats/dashboard/',
  '/stats/dashboard/../dashboard/index.html',
  '/stats/dashboard/%69ndex.html',
])('rejects the static-file alias %s', async rawPath => {
  expect(await request(rawPath)).toBe(400)
})

it('keeps canonical stats paths available behind HAProxy and other public assets unchanged', async () => {
  expect(await request('/stats/dashboard/')).toBe(200)
  expect(await request('/stats/dashboard/index.html')).toBe(200)
  expect(await request('/public-file.txt')).toBe(200)
  expect(await request('/%70ublic-file.txt')).toBe(200)
})
