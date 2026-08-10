jest.mock('../server/init', () => ({
  failureCache: { set: jest.fn() },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn() },
}))

import { failureCache } from '../server/init'
import logger from '../server/Logger'
import { JobCancelledError } from '../server/Queue'
import errorHandler from '../server/middlewares/results/error.middleware'

describe('build cancellation errors', () => {
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
