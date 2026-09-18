import { createRequestLoggerMiddleware } from '../server/middlewares/requestLogger.middleware'

const mockRecordRequestStart = jest.fn()

const mockRecordRequestComplete = jest.fn()

const requestLoggerMiddleware = createRequestLoggerMiddleware({
  recordRequestStart: mockRecordRequestStart,
  recordRequestComplete: mockRecordRequestComplete,
  logger: { info: jest.fn() },
})

describe('request memory metrics', () => {
  beforeEach(() => {
    mockRecordRequestStart.mockReset()
    mockRecordRequestComplete.mockReset()
  })

  it('records normalized request metrics without swallowing errors', async () => {
    const error = new Error('request failed')

    const context = {
      path: '/package/example',
      request: { url: '/package/example' },
      response: { status: 500 },
    }

    await expect(
      // SAFETY: this fixture supplies the request fields exercised by the middleware.
      requestLoggerMiddleware(context as never, async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(mockRecordRequestStart).toHaveBeenCalledTimes(1)
    expect(mockRecordRequestComplete).toHaveBeenCalledWith({
      route: '/package/*',
      status: 500,
      durationMs: expect.any(Number),
    })
  })
})
