import fetch from 'unfetch'

import API from '../client/api'

jest.mock('unfetch')

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>
type APIResponse = Awaited<ReturnType<typeof fetch>>

function mockResponse(
  status: number,
  json: () => Promise<unknown>,
): APIResponse {
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
  beforeEach(() => {
    mockedFetch.mockReset()
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
