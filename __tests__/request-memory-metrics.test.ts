import requestLoggerMiddleware from '../server/middlewares/requestLogger.middleware'
import {
  recordRequestComplete,
  recordRequestStart,
} from '../server/MemoryDiagnostics'

jest.mock('../server/MemoryDiagnostics', () => ({
  recordRequestStart: jest.fn(),
  recordRequestComplete: jest.fn(),
}))

const mockRecordRequestStart = recordRequestStart as jest.MockedFunction<
  typeof recordRequestStart
>
const mockRecordRequestComplete = recordRequestComplete as jest.MockedFunction<
  typeof recordRequestComplete
>

describe('request memory metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records normalized request metrics without swallowing errors', async () => {
    const error = new Error('request failed')
    const context = {
      path: '/package/example',
      request: { url: '/package/example' },
      response: { status: 500 },
    }

    await expect(
      requestLoggerMiddleware(context as never, async () => {
        throw error
      })
    ).rejects.toBe(error)

    expect(mockRecordRequestStart).toHaveBeenCalledTimes(1)
    expect(mockRecordRequestComplete).toHaveBeenCalledWith({
      route: '/package/*',
      status: 500,
      durationMs: expect.any(Number),
    })
  })
})
