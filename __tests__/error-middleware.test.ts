import { failureCache } from '../server/infrastructure/runtime.init'
import logger from '../server/infrastructure/logger.service'
import { createAnalysisKey } from '../server/analysis/analysis.key'
import CustomError from '../server/errors/custom.error'
import errorHandler from '../server/middlewares/results/error.middleware'

const mockFailureCacheSet = jest.spyOn(failureCache, 'set')

const mockLoggerError = jest.spyOn(logger, 'error')

interface ErrorContextState {
  id: string
  analysis?: {
    language: 'javascript'
    operation: 'package-exports'
  }
  resolved?: { packageString: string }
}

describe('build API error middleware', () => {
  beforeEach(() => {
    mockFailureCacheSet.mockReset()
    mockLoggerError.mockReset()
  })

  it('preserves client HTTP errors before package resolution', async () => {
    const error = Object.assign(
      new Error('package query parameter is required'),
      {
        name: 'BadRequestError',
        status: 400,
      },
    )

    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      state: { id: 'request-id' },
      status: undefined,
    }

    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    await errorHandler(ctx as never, async () => {
      throw error
    })

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({
      error: {
        code: 'BadRequestError',
        details: {},
        message: 'package query parameter is required',
      },
    })
  })

  it('caches build errors under the package resolved downstream', async () => {
    const packageString = '@example/build-error@1.0.0'

    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      // SAFETY: this fixture supplies the state fields exercised by the middleware.
      state: { id: 'request-id' } as ErrorContextState,
      status: undefined,
    }

    const error = new CustomError('BuildError', 'compiler failed', undefined)

    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    await errorHandler(ctx as never, async () => {
      ctx.state.analysis = {
        language: 'javascript',
        operation: 'package-exports',
      }
      ctx.state.resolved = { packageString }
      throw error
    })

    const responseBody = ctx.body
    expect(failureCache.set).toHaveBeenCalledWith(
      createAnalysisKey({
        language: 'javascript',
        operation: 'package-exports',
        packageSpecifier: packageString,
      }),
      {
        status: 422,
        body: responseBody,
      },
    )
  })

  it('labels a single mismatch suggestion as the latest version', async () => {
    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      state: { id: 'request-id' },
      status: undefined,
    }

    // SAFETY: this fixture supplies only the context fields exercised by the middleware.
    await errorHandler(ctx as never, async () => {
      throw new CustomError('PackageVersionMismatchError', null, {
        suggestedVersion: '19.1.1',
      })
    })

    expect(ctx.status).toBe(404)
    expect(ctx.body).toMatchObject({
      error: {
        code: 'PackageVersionMismatchError',
        message:
          'This package has not been published with this particular version. The latest version is `<code>19.1.1</code>`.',
      },
    })
  })
})
