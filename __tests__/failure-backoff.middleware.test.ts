import { createAnalysisKey } from '../server/analysis/keys'
import { recordFailure } from '../server/failure-backoff'
import failureBackoffMiddleware from '../server/middlewares/results/failure-backoff.middleware'
import { failureCache } from '../server/infrastructure/runtime'

const packageString = '@example/package@1.0.0'

const failureCacheKey = createAnalysisKey({
  language: 'javascript',
  operation: 'package-analysis',
  packageSpecifier: packageString,
})

const failure = { status: 422, body: { error: { code: 'BuildError' } } }

describe('failure backoff middleware', () => {
  afterEach(() => {
    failureCache.del(failureCacheKey)
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
    expect(ctx.body).toBe(second.body)
    expect(ctx.set).toHaveBeenCalledWith('Retry-After', expect.any(String))
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
