import axios from 'axios'

import CustomError from '../server/CustomError'
import BuildService from '../server/api/BuildService'
import { failureCache, requestQueue } from '../server/init'
import errorMiddleware from '../server/middlewares/results/error.middleware'

jest.mock('../server/init', () => ({
  failureCache: {
    set: jest.fn(),
  },
  pool: {
    exec: jest.fn(),
  },
  requestQueue: {
    addExecutor: jest.fn(),
    cancel: jest.fn(),
    process: jest.fn(),
  },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}))

const mockedFailureCache = failureCache as jest.Mocked<typeof failureCache>
const mockedRequestQueue = requestQueue as jest.Mocked<typeof requestQueue>

describe('build service unavailability', () => {
  const originalBuildServiceEndpoint = process.env.BUILD_SERVICE_ENDPOINT

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BUILD_SERVICE_ENDPOINT = 'http://127.0.0.1:7002'
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    if (originalBuildServiceEndpoint === undefined) {
      delete process.env.BUILD_SERVICE_ENDPOINT
    } else {
      process.env.BUILD_SERVICE_ENDPOINT = originalBuildServiceEndpoint
    }
  })

  it('identifies a build service request that receives no response', async () => {
    const url = 'http://127.0.0.1:7002/size?p=%40example%2Funavailable%401.0.0'
    const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
      isAxiosError: true,
      request: { _currentUrl: url },
    })
    jest.spyOn(axios, 'get').mockRejectedValue(networkError)

    new BuildService()
    const executor = mockedRequestQueue.addExecutor.mock.calls[0][1]

    await expect(
      executor({ packageString: '@example/unavailable@1.0.0' })
    ).rejects.toMatchObject({
      name: 'BuildServiceUnavailableError',
      originalError: {
        operation: 'PACKAGE_BUILD_STATS',
        reason: 'BUILD_SERVICE_UNREACHABLE',
        url,
      },
    })
  })

  it('returns a retryable response without caching the failure', async () => {
    const ctx = {
      query: {},
      state: {
        id: 'build-service-unavailable-test',
        resolved: { packageString: '@example/unavailable@1.0.0' },
      },
    }
    const error = new CustomError(
      'BuildServiceUnavailableError',
      { reason: 'BUILD_SERVICE_UNREACHABLE' },
      undefined
    )

    await errorMiddleware(ctx as never, async () => {
      throw error
    })

    expect(ctx).toMatchObject({
      status: 503,
      cacheControl: { maxAge: 0 },
      body: {
        error: {
          code: 'BuildServiceUnavailableError',
          message:
            'The build service is temporarily unavailable. Please try again in a few minutes.',
        },
      },
    })
    expect(mockedFailureCache.set).not.toHaveBeenCalled()
  })

  it('continues caching genuine package build failures', async () => {
    const packageString = '@example/build-error@1.0.0'
    const ctx = {
      query: {},
      state: {
        id: 'build-error-test',
        resolved: { packageString },
      },
    }
    const error = new CustomError('BuildError', 'parse failed', undefined)

    await errorMiddleware(ctx as never, async () => {
      throw error
    })

    expect(ctx).toMatchObject({
      status: 422,
      body: {
        error: {
          code: 'BuildError',
          message: 'Failed to build this package.',
        },
      },
    })
    expect(mockedFailureCache.set).toHaveBeenCalledWith(
      packageString,
      expect.objectContaining({ status: 422 })
    )
  })
})
