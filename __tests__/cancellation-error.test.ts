import { failureCache } from '../server/infrastructure/runtime'
import logger from '../server/infrastructure/logger.service'
import { JobCancelledError } from '../server/infrastructure/queue.service'
import errorHandler from '../server/middlewares/results/error.middleware'

const mockFailureCacheSet = jest.spyOn(failureCache, 'set')

const mockLoggerError = jest.spyOn(logger, 'error')

const mockLoggerInfo = jest.spyOn(logger, 'info')

describe('build cancellation errors', () => {
  beforeEach(() => {
    mockFailureCacheSet.mockReset()
    mockLoggerError.mockReset()
    mockLoggerInfo.mockReset()
  })

  it('returns a non-cacheable client error without recording a build failure', async () => {
    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      state: {
        id: 'request-id',
        resolved: { packageString: 'example@1.0.0' },
      },
      status: undefined,
    }

    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    await errorHandler(ctx as never, async () => {
      throw new JobCancelledError()
    })

    expect(ctx.status).toBe(408)
    expect(ctx.cacheControl).toEqual({ maxAge: 0 })
    expect(ctx.body).toEqual({
      error: {
        code: 'BuildCancelledError',
        message:
          'The package build was cancelled because the client disconnected.',
      },
    })
    expect(failureCache.set).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      'BUILD_CANCELLED',
      expect.objectContaining({
        packageString: 'example@1.0.0',
        requestId: 'request-id',
      }),
      'BUILD_CANCELLED example@1.0.0',
    )
  })
})
