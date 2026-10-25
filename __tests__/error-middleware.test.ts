import { failureCache } from '../server/infrastructure/runtime'
import logger from '../server/infrastructure/logger.service'
import { createAnalysisKey } from '../server/analysis/keys'
import CustomError from '../server/custom-error'
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

    expect(failureCache.set).toHaveBeenCalledWith(
      createAnalysisKey({
        language: 'javascript',
        operation: 'package-exports',
        packageSpecifier: packageString,
      }),
      expect.objectContaining({
        status: 422,
        consecutiveFailures: 1,
      }),
    )

    failureCache.del(
      createAnalysisKey({
        language: 'javascript',
        operation: 'package-exports',
        packageSpecifier: packageString,
      }),
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

    // SAFETY: the fixture supplies the context fields read by this middleware.
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

  it('counts a shared failed attempt once for coalesced callers', async () => {
    const error = new CustomError(
      'BuildError',
      'one failed compilation',
      undefined,
    )

    for (let caller = 0; caller < 2; caller += 1) {
      const ctx = {
        query: {},
        state: {
          id: String(caller),
          analysis: { language: 'javascript', operation: 'package-analysis' },
          resolved: { packageString: '@example/coalesced@1.0.0' },
        },
      }

      // SAFETY: this fixture provides the error middleware's context fields.
      await errorHandler(ctx as never, async () => {
        throw error
      })
    }

    expect(mockFailureCacheSet).toHaveBeenCalledTimes(1)
  })
})

it.each([false, true])(
  'distinguishes missing root packages from install failures (buildRequested=%s)',
  async buildRequested => {
    const ctx = {
      query: {},
      state: {
        id: `missing-package-${buildRequested}`,
        resolved: { packageString: '@ucdjs/schema-gen@0.2.2' },
        analysis: {
          language: 'javascript',
          operation: 'package-analysis',
          buildRequested,
        },
      },
      body: undefined,
      status: undefined,
      cacheControl: undefined,
    }

    // SAFETY: the fixture supplies the context fields read by this middleware.
    await errorHandler(ctx as never, async () => {
      throw new CustomError(
        'PackageNotFoundError',
        'No matching version found for @ucdjs-internal/shared@0.1.0',
        undefined,
      )
    })
    expect(ctx.status).toBe(buildRequested ? 422 : 404)
    expect(ctx.body).toMatchObject({
      error: { code: buildRequested ? 'InstallError' : 'PackageNotFoundError' },
    })
  },
)
