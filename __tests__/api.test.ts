/* eslint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion */

import fetch from 'unfetch'

import API, { setFetchImplementation } from '../client/api'
import type { JsonValue } from '../types/json'

const mockedFetch = jest.fn<typeof fetch>()

type APIResponse = Awaited<ReturnType<typeof fetch>>

function mockResponse(
  status: number,
  json: () => Promise<JsonValue>,
): APIResponse {
  // SAFETY: this fixture supplies the response members consumed by client/api.
  return {
    ok: status >= 200 && status < 300,
    status,
    json,
  } as APIResponse
}

const requestMethods = [
  ['GET', () => API.get('/test')],
  ['POST', () => API.post('/test', { package: 'example' })],
] as const

describe('API error responses', () => {
  let restoreFetch: () => void

  beforeEach(() => {
    mockedFetch.mockReset()
    restoreFetch?.()
    restoreFetch = setFetchImplementation(mockedFetch)
  })

  afterEach(() => {
    restoreFetch()
  })

  test.each(requestMethods)(
    '%s preserves a structured JSON error response',
    async (_method, request) => {
      const responseBody = {
        error: {
          code: 'PackageNotFoundError',
          message: "The package you were looking for doesn't exist.",
        },
      }

      mockedFetch.mockResolvedValue(
        mockResponse(404, () => Promise.resolve(responseBody)),
      )

      await expect(request()).rejects.toEqual(responseBody)
    },
  )

  test.each([
    ...requestMethods.map(
      ([method, request]) => [method, 502, request] as const,
    ),
    ...requestMethods.map(
      ([method, request]) => [method, 503, request] as const,
    ),
  ])(
    '%s returns a retryable structured error for a malformed %s response',
    async (_method, status, request) => {
      mockedFetch.mockResolvedValue(
        mockResponse(status, () => Promise.reject(new SyntaxError('HTML'))),
      )

      await expect(request()).rejects.toEqual({
        error: {
          code: 'ServiceUnavailableError',
          message:
            'The build service is temporarily unavailable. Please try again in a few minutes.',
        },
      })
    },
  )

  test.each(requestMethods)(
    '%s returns a generic structured error for another malformed response',
    async (_method, request) => {
      mockedFetch.mockResolvedValue(
        mockResponse(500, () => Promise.reject(new SyntaxError('HTML'))),
      )

      await expect(request()).rejects.toEqual({
        error: {
          code: 'BuildError',
          message:
            "Oops, something went wrong and we don't have an appropriate error for this. Open an issue maybe?",
        },
      })
    },
  )
})

describe('API early data preloading', () => {
  let restoreFetch: () => void

  beforeEach(() => {
    mockedFetch.mockReset()
    restoreFetch?.()
    restoreFetch = setFetchImplementation(mockedFetch)
    ;(globalThis as unknown as { window?: typeof window }).window =
      globalThis as unknown as typeof window
    delete (globalThis as unknown as { window: { __BP_PRELOAD__?: unknown } })
      .window.__BP_PRELOAD__
  })

  afterEach(() => {
    restoreFetch()
    delete (globalThis as unknown as { window?: typeof window }).window
  })

  test('consumes preloaded promise from window.__BP_PRELOAD__ without dispatching fetch', async () => {
    const payload = { name: 'react', version: '19.3.1', size: 1000 }
    const url = '/api/size?package=react@19.3.1&record=true'

    window.__BP_PRELOAD__ = {
      [url]: Promise.resolve(mockResponse(200, () => Promise.resolve(payload))),
    }

    const result = await API.get(url)

    expect(result).toEqual(payload)
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(window.__BP_PRELOAD__[url]).toBeUndefined()
  })

  test('falls back to standard fetch when no preloaded promise exists', async () => {
    const payload = { name: 'vue', version: '3.4.0' }
    const url = '/api/size?package=vue&record=true'

    mockedFetch.mockResolvedValue(
      mockResponse(200, () => Promise.resolve(payload)),
    )

    const result = await API.get(url)

    expect(result).toEqual(payload)
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  test('generates consistent URL helpers matching API methods', () => {
    expect(API.getInfoUrl('react@19.3.1')).toBe(
      '/api/size?package=react@19.3.1&record=true',
    )
    expect(API.getTrendsUrl(['react', 'vue'], 'last-year')).toBe(
      '/api/trends?packages=react%2Cvue&range=last-year',
    )
    expect(API.getDependenciesUrl('lodash')).toBe(
      '/api/dependencies?package=lodash',
    )
  })
})
