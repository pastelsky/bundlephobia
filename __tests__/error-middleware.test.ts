jest.mock('../server/init', () => ({
  failureCache: { set: jest.fn() },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}))

import { failureCache } from '../server/init'
import CustomError from '../server/CustomError'
import errorHandler from '../server/middlewares/results/error.middleware'

describe('build API error middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('preserves client HTTP errors before package resolution', async () => {
    const error = Object.assign(
      new Error('package query parameter is required'),
      {
        name: 'BadRequestError',
        status: 400,
      }
    )
    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      state: { id: 'request-id' },
      status: undefined,
    }

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
      state: { id: 'request-id' } as {
        id: string
        resolved?: { packageString: string }
      },
      status: undefined,
    }
    const error = new CustomError('BuildError', 'compiler failed', undefined)

    await errorHandler(ctx as never, async () => {
      ctx.state.resolved = { packageString }
      throw error
    })

    const responseBody = ctx.body
    expect(failureCache.set).toHaveBeenCalledWith(packageString, {
      status: 422,
      body: responseBody,
    })
  })

  it('labels a single mismatch suggestion as the latest version', async () => {
    const ctx = {
      body: undefined,
      cacheControl: undefined,
      query: {},
      state: { id: 'request-id' },
      status: undefined,
    }

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
