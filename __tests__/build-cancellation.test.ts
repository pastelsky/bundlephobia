import AbortController from 'abort-controller'
import { EventEmitter } from 'events'

import logger from '../server/Logger'
import { JobCancelledError } from '../server/Queue'
import { packageAnalysisGateway } from '../server/analysis'
import { createBuildMiddleware } from '../server/middlewares/results/build.middleware'

const mockAnalyzePackage = jest.spyOn(packageAnalysisGateway, 'analyzePackage')

const mockLoggerInfo = jest.spyOn(logger, 'info')

const cache = {
  setPackageSize: jest.fn(),
}

const buildMiddleware = createBuildMiddleware(cache)

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
        analysis: {
          language: 'javascript',
          operation: 'package-analysis',
        },
        resolved: {
          description: 'description',
          canonicalSpecifier: 'example@1.0.0',
          displayName: 'example',
          language: 'javascript',
          name: 'example',
          packageString: 'example@1.0.0',
          repository: undefined,
          specifier: 'example@1.0.0',
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
    // SAFETY: the test controller is compatible with the global constructor contract.
    global.AbortController = AbortController as typeof global.AbortController
  })

  afterAll(() => {
    global.AbortController = nativeAbortController
  })

  beforeEach(() => {
    mockAnalyzePackage.mockReset()
    mockLoggerInfo.mockReset()
  })

  it('aborts a build only when the response closes prematurely', async () => {
    let buildSignal: AbortSignal | undefined
    mockAnalyzePackage.mockImplementation(async (_resolved, options) => {
      const { signal } = options
      buildSignal = options.signal

      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new JobCancelledError()),
          { once: true },
        )
      })
    })
    const { context, request, response } = createContext()

    // SAFETY: this fixture supplies the context fields exercised by the middleware.
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
      'BUILD_ABORTED: client closed connection for package example@1.0.0',
    )
  })

  it('does not abort after the response has ended normally', async () => {
    let buildSignal: AbortSignal | undefined
    let resolveBuild: (result: { size: number }) => void = () => {}

    mockAnalyzePackage.mockImplementation(async (_resolved, options) => {
      buildSignal = options.signal

      return new Promise(resolve => {
        resolveBuild = resolve
      })
    })
    const { context, response } = createContext()

    // SAFETY: this fixture supplies the context fields exercised by the middleware.
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
      }),
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      'BUILD_ABORTED',
      expect.anything(),
      expect.anything(),
    )
  })

  it('sets the measured build duration for the proxy', async () => {
    mockAnalyzePackage.mockImplementation(async (_resolved, options) => {
      options.onComplete(321)

      return Promise.resolve({ size: 123 })
    })
    const { context } = createContext()

    // SAFETY: this fixture supplies the context fields exercised by the middleware.
    await buildMiddleware(context as never, jest.fn())

    expect(context.headers['x-bundlephobia-build-duration-ms']).toBe('321')
  })
})
