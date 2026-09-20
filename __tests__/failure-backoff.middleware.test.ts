import { createAnalysisKey } from '../server/analysis/keys'
import { recordFailure } from '../server/failure-backoff'
import failureBackoffMiddleware from '../server/middlewares/results/failure-backoff.middleware'
import { failureCache, logger } from '../server/infrastructure/runtime'

const packageString = '@example/package@1.0.0'

const failureCacheKey = createAnalysisKey({
  language: 'javascript',
  operation: 'package-analysis',
  packageSpecifier: packageString,
})

const failure = { status: 422, body: { error: { code: 'BuildError' } } }

const mockedLogger = jest.spyOn(logger, 'info')

describe('failure backoff middleware', () => {
  afterEach(() => {
    failureCache.del(failureCacheKey)
    mockedLogger.mockClear()
  })

  it('blocks after the second consecutive failure', async () => {
    const first = recordFailure(undefined, failure, Date.now())
    const second = recordFailure(first, failure, Date.now())
    failureCache.set(failureCacheKey, second)

    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      set: jest.fn(),
      state: {
        analysis: { language: 'javascript', operation: 'package-analysis' },
        resolved: { packageString },
      },
      status: undefined,
    }

    const next = jest.fn()

    // SAFETY: this fixture provides the middleware fields exercised by the test.
    await failureBackoffMiddleware(ctx as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(422)
    expect(ctx.body).toEqual({
      error: {
        code: 'BuildError',
        message:
          'The package has failed to build multiple times recently and further tries are temporarily paused. Please try again later.',
      },
    })
    expect(ctx.set).toHaveBeenCalledWith('Retry-After', expect.any(String))
    expect(mockedLogger).toHaveBeenCalledWith(
      'BUILD_BACKOFF',
      expect.objectContaining({ consecutiveFailures: 2 }),
      expect.stringContaining('BUILD BACKOFF'),
    )
  })

  it('clears the consecutive failure history after success', async () => {
    const first = recordFailure(undefined, failure, Date.now())
    failureCache.set(failureCacheKey, first)

    const ctx = {
      query: {},
      set: jest.fn(),
      state: {
        analysis: { language: 'javascript', operation: 'package-analysis' },
        resolved: { packageString },
      },
      status: 200,
    }

    // SAFETY: this fixture provides the middleware fields exercised by the test.
    await failureBackoffMiddleware(ctx as never, async () => {})

    expect(failureCache.get(failureCacheKey)).toBeUndefined()
  })
})
