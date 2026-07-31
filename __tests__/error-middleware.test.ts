jest.mock('../server/init', () => ({
  failureCache: { set: jest.fn() },
}))

jest.mock('../server/Logger', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}))

import errorHandler from '../server/middlewares/results/error.middleware'

describe('build API error middleware', () => {
  it('preserves client HTTP errors before package resolution', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
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
    expect(consoleError).toHaveBeenCalledWith(error)
    consoleError.mockRestore()
  })
})
