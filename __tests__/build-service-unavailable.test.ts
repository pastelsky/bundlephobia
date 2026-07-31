import AbortController from 'abort-controller'
import axios from 'axios'

import serializeError from '../build-service/serializeError'
import CustomError from '../server/CustomError'
import BuildService from '../server/api/BuildService'
import { failureCache, pool, requestQueue } from '../server/init'
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
const mockedPool = pool as jest.Mocked<typeof pool>
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
    const controller = new AbortController()

    await expect(
      executor(
        { packageString: '@example/unavailable@1.0.0' },
        {
          signal: controller.signal as unknown as globalThis.AbortSignal,
        }
      )
    ).rejects.toMatchObject({
      name: 'BuildServiceUnavailableError',
      originalError: {
        operation: 'PACKAGE_BUILD_STATS',
        reason: 'BUILD_SERVICE_UNREACHABLE',
        url,
      },
    })
  })

  it('serializes native errors into the build-service error contract', () => {
    const error = Object.assign(new Error('disk full'), { code: 'ENOSPC' })

    expect(serializeError(error)).toEqual({
      name: 'BuildServiceError',
      originalError: {
        message: 'disk full',
        code: 'ENOSPC',
      },
      extra: { retryable: true },
    })
  })

  it('preserves structured package build errors', () => {
    const serialized = {
      name: 'EntryPointError',
      originalError: 'No package entry point',
      extra: undefined,
    }

    expect(serializeError({ toJSON: () => serialized })).toBe(serialized)
  })

  it('identifies a structured internal build-service error', async () => {
    const responseBody = serializeError(
      Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    )
    const responseError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { data: responseBody },
    })
    jest.spyOn(axios, 'get').mockRejectedValue(responseError)

    new BuildService()
    const executor = mockedRequestQueue.addExecutor.mock.calls[0][1]
    const controller = new AbortController()

    await expect(
      executor(
        { packageString: '@example/internal-error@1.0.0' },
        {
          signal: controller.signal as unknown as globalThis.AbortSignal,
        }
      )
    ).rejects.toMatchObject(responseBody)
  })

  it('cancels an in-flight build-service request when its job aborts', async () => {
    const controller = new AbortController()
    jest.spyOn(axios, 'get').mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener?.(
          'abort',
          () => reject(new axios.CanceledError()),
          { once: true }
        )
      })
    })

    new BuildService()
    const executor = mockedRequestQueue.addExecutor.mock.calls[0][1]
    const result = executor(
      { packageString: '@example/cancelled@1.0.0' },
      {
        signal: controller.signal as unknown as globalThis.AbortSignal,
      }
    )

    controller.abort()

    await expect(result).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
      name: 'JobCancelledError',
    })
    expect(axios.get).toHaveBeenCalledWith(
      'http://127.0.0.1:7002/size?p=%40example%2Fcancelled%401.0.0',
      expect.objectContaining({
        signal: controller.signal,
      })
    )
  })

  it('cancels an in-process worker execution when its job aborts', async () => {
    delete process.env.BUILD_SERVICE_ENDPOINT
    const controller = new AbortController()
    let rejectExecution: (error: Error) => void = () => {}
    const execution = new Promise((_resolve, reject) => {
      rejectExecution = reject
    }) as ReturnType<typeof pool.exec>
    execution.timeout = jest.fn().mockReturnValue(execution)
    execution.cancel = jest.fn(() => {
      rejectExecution(new Error('worker execution cancelled'))
    })
    mockedPool.exec.mockReturnValue(execution)

    new BuildService()
    const executor = mockedRequestQueue.addExecutor.mock.calls[0][1]
    const result = executor(
      { packageString: '@example/cancelled@1.0.0' },
      {
        signal: controller.signal as unknown as globalThis.AbortSignal,
      }
    )

    controller.abort()

    await expect(result).rejects.toThrow('worker execution cancelled')
    expect(execution.cancel).toHaveBeenCalledTimes(1)
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

  it('does not cache internal build-service errors', async () => {
    const ctx = {
      query: {},
      state: {
        id: 'build-service-error-test',
        resolved: { packageString: '@example/internal-error@1.0.0' },
      },
    }
    const error = new CustomError(
      'BuildServiceError',
      { message: 'disk full', code: 'ENOSPC' },
      { retryable: true }
    )

    await errorMiddleware(ctx as never, async () => {
      throw error
    })

    expect(ctx).toMatchObject({
      status: 503,
      cacheControl: { maxAge: 0 },
      body: {
        error: {
          code: 'BuildServiceError',
          message:
            'The build service encountered a temporary error. Please try again in a few minutes.',
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
