import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../library-discovery.config.json' with { type: 'json' }
import { createDiscoveryClients } from './library-discovery-http.mjs'

const policy = {
  ...config.http,
  npmIntervalMs: 1,
  codeSearchIntervalMs: 1,
  retryMinTimeoutMs: 1,
  maxRetryTimeMs: 1000,
}

const githubRequest = async () => ({ data: { ok: true } })

test('npm rate limiting retries without bypassing the shared request throttle', async () => {
  let calls = 0

  const fetchImpl = async () =>
    ++calls === 1
      ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
      : Response.json({ name: 'browser-library' })

  const { registry } = createDiscoveryClients({
    githubRequest,
    fetchImpl,
    policy,
  })

  assert.deepEqual(
    await registry('https://registry.npmjs.org/browser-library/latest'),
    { name: 'browser-library' },
  )
  assert.equal(calls, 2)
})

test('missing npm packages are not retried', async () => {
  let calls = 0

  const fetchImpl = async () => {
    calls++

    return new Response('', { status: 404 })
  }

  const { registry } = createDiscoveryClients({
    githubRequest,
    fetchImpl,
    policy,
  })

  await assert.rejects(
    registry('https://registry.npmjs.org/missing/latest'),
    /HTTP 404/,
  )
  assert.equal(calls, 1)
})

test('persistent npm rate limiting has a finite retry budget', async () => {
  let calls = 0

  const fetchImpl = async () => {
    calls++

    return new Response('', { status: 429 })
  }

  const { registry } = createDiscoveryClients({
    githubRequest,
    fetchImpl,
    policy,
  })

  await assert.rejects(
    registry('https://registry.npmjs.org/throttled/latest'),
    /HTTP 429/,
  )
  assert.equal(calls, 3)
})

test('long Retry-After pauses are deferred to a later run instead of retried early', async () => {
  let calls = 0

  const fetchImpl = async () => {
    calls++

    return new Response('', { status: 429, headers: { 'retry-after': '120' } })
  }

  const { registry } = createDiscoveryClients({
    githubRequest,
    fetchImpl,
    policy,
  })

  await assert.rejects(
    registry('https://registry.npmjs.org/throttled/latest'),
    /HTTP 429/,
  )
  assert.equal(calls, 1)
})
