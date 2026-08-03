import AbortController from 'abort-controller'
import { EventEmitter } from 'events'

const mockGetPackageBuildStats = jest.fn()

jest.mock('../server/api/BuildService', () => ({
  __esModule: true,
  BUILD_DURATION_HEADER: 'x-bundlephobia-build-duration-ms',
  default: jest.fn().mockImplementation(() => ({
    getPackageBuildStats: (...args: unknown[]) =>
      mockGetPackageBuildStats(...args),
  })),
}))

jest.mock('../utils/cache.utils', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    setPackageSize: jest.fn(),
  })),
}))

jest.mock('../utils/firebase.utils', () => ({
  __esModule: true,
  default: { setRecentSearch: jest.fn() },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: { info: jest.fn() },
}))

import logger from '../server/Logger'
import { JobCancelledError } from '../server/Queue'
import buildMiddleware from '../server/middlewares/results/build.middleware'

function createContext() {
  const request = new EventEmitter()
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
  })
  const headers: Record<string, string> = {}
  return {
    context: {
      body: undefined,
      cacheControl: undefined,
      headers,
      query: {},
      req: request,
      res: response,
      set: jest.fn((name: string, value: string) => {
        headers[name] = value
      }),
      state: {
        id: 'request-id',
        resolved: {
          description: 'description',
          name: 'example',
          packageString: 'example@1.0.0',
          repository: undefined,
          scoped: false,
          version: '1.0.0',
        },
      },
    },
    request,
    response,
  }
}

describe('build request cancellation', () => {
  const nativeAbortController = global.AbortController

  beforeAll(() => {
    global.AbortController =
      AbortController as unknown as typeof global.AbortController
  })

  afterAll(() => {
    global.AbortController = nativeAbortController
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('aborts a build only when the response closes prematurely', async () => {
    let buildSignal: AbortSignal | undefined
    mockGetPackageBuildStats.mockImplementation(
      (_packageString, _priority, options: { signal: AbortSignal }) => {
        buildSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new JobCancelledError()),
            { once: true }
          )
        })
      }
    )
    const { context, request, response } = createContext()

    const result = buildMiddleware(context as never, jest.fn())

    request.emit('close')
    expect(buildSignal?.aborted).toBe(false)

    response.emit('close')

    await expect(result).rejects.toMatchObject({ code: 'JOB_CANCELLED' })
    expect(buildSignal?.aborted).toBe(true)
    expect(logger.info).toHaveBeenCalledWith(
      'BUILD_ABORTED',
      expect.objectContaining({
        packageString: 'example@1.0.0',
        requestId: 'request-id',
      }),
      'BUILD_ABORTED: client closed connection for package example@1.0.0'
    )
  })

  it('does not abort after the response has ended normally', async () => {
    let buildSignal: AbortSignal | undefined
    let resolveBuild: (result: { size: number }) => void = () => {}
    mockGetPackageBuildStats.mockImplementation(
      (_packageString, _priority, options: { signal: AbortSignal }) => {
        buildSignal = options.signal
        return new Promise(resolve => {
          resolveBuild = resolve
        })
      }
    )
    const { context, response } = createContext()

    const result = buildMiddleware(context as never, jest.fn())

    response.writableEnded = true
    response.emit('close')
    expect(buildSignal?.aborted).toBe(false)

    resolveBuild({ size: 123 })
    await result

    expect(context.body).toEqual(
      expect.objectContaining({
        name: 'example',
        size: 123,
        version: '1.0.0',
      })
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      'BUILD_ABORTED',
      expect.anything(),
      expect.anything()
    )
  })

  it('sets the measured build duration for the proxy', async () => {
    mockGetPackageBuildStats.mockImplementation(
      (
        _packageString,
        _priority,
        options: { onComplete: (durationMs: number) => void }
      ) => {
        options.onComplete(321)
        return Promise.resolve({ size: 123 })
      }
    )
    const { context } = createContext()

    await buildMiddleware(context as never, jest.fn())

    expect(context.headers['x-bundlephobia-build-duration-ms']).toBe('321')
  })
})
