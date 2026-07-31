import AbortController from 'abort-controller'
import { EventEmitter } from 'node:events'
import { fork } from 'node:child_process'

import runPackageOperation from '../build-service/runPackageOperation'

jest.mock('node:child_process', () => ({
  fork: jest.fn(),
}))

const mockedFork = fork as jest.MockedFunction<typeof fork>

function createWorker() {
  const worker = new EventEmitter() as EventEmitter & {
    send: jest.Mock
    kill: jest.Mock
  }
  worker.send = jest.fn()
  worker.kill = jest.fn()
  return worker
}

describe('build-service package operation runner', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('runs an operation in an isolated child process', async () => {
    const worker = createWorker()
    mockedFork.mockReturnValue(worker as never)

    const result = runPackageOperation('size', 'example@1.0.0')
    worker.emit('spawn')

    expect(worker.send).toHaveBeenCalledWith({
      type: 'run',
      operation: 'size',
      packageString: 'example@1.0.0',
    })

    worker.emit('message', { type: 'result', result: { size: 42 } })
    await expect(result).resolves.toEqual({ size: 42 })
  })

  it('gracefully aborts and then force-kills a worker that does not exit', async () => {
    const worker = createWorker()
    mockedFork.mockReturnValue(worker as never)
    const controller = new AbortController()

    const result = runPackageOperation('size', 'example@1.0.0', {
      signal: controller.signal as unknown as globalThis.AbortSignal,
    })
    worker.emit('spawn')
    controller.abort()

    await expect(result).rejects.toMatchObject({
      code: 'BUILD_CANCELLED',
      name: 'BuildOperationCancelledError',
    })
    expect(worker.send).toHaveBeenLastCalledWith({ type: 'cancel' })
    expect(worker.kill).toHaveBeenCalledWith('SIGTERM')

    jest.advanceTimersByTime(2000)
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('preserves structured package-build errors', async () => {
    const worker = createWorker()
    mockedFork.mockReturnValue(worker as never)
    const payload = {
      name: 'EntryPointError',
      originalError: 'No package entry point',
    }

    const result = runPackageOperation('size', 'example@1.0.0')
    worker.emit('spawn')
    worker.emit('message', { type: 'error', error: payload })

    await expect(result).rejects.toMatchObject({
      name: 'EntryPointError',
      payload,
    })
  })
})
