import AbortController from 'abort-controller'

import Queue from '../server/Queue'

describe('Queue cancellation', () => {
  const nativeAbortController = global.AbortController

  beforeAll(() => {
    global.AbortController =
      AbortController as unknown as typeof global.AbortController
  })

  afterAll(() => {
    global.AbortController = nativeAbortController
  })

  it('cancels a ready job in the queue', async () => {
    const queue = new Queue({ concurrency: 1 })

    let resolveFirstJob: any
    const firstJobPromise = new Promise(resolve => {
      resolveFirstJob = resolve
    })

    queue.addExecutor('TEST', () => firstJobPromise)

    const p1 = queue.process('job-1', 'TEST', {})
    const p2 = queue.process('job-2', 'TEST', {})

    expect(queue.getReadyJobs().length).toBe(1)
    expect(queue.getRunningJobs().length).toBe(1)

    queue.cancel('job-2', 'TEST')

    await expect(p2).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
      name: 'JobCancelledError',
    })
    expect(queue.getReadyJobs().length).toBe(0)

    resolveFirstJob()
    await p1
  })

  it('cancels a processing job and calls its cancel handler', async () => {
    const queue = new Queue({ concurrency: 1 })

    const mockCancel = jest.fn()
    const mockPromise: any = new Promise(() => {})
    mockPromise.cancel = mockCancel

    queue.addExecutor('TEST', () => mockPromise)

    const p1 = queue.process('job-1', 'TEST', {})

    expect(queue.getRunningJobs().length).toBe(1)

    queue.cancel('job-1', 'TEST')

    expect(mockCancel).toHaveBeenCalledTimes(1)
    await expect(p1).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
      name: 'JobCancelledError',
    })
    expect(queue.getRunningJobs().length).toBe(1)
  })

  it('keeps canceled work counted until its executor settles', async () => {
    const queue = new Queue({ concurrency: 1 })

    let resolveFirstJob: any
    const firstJobPromise = new Promise(resolve => {
      resolveFirstJob = resolve
    })
    const executor = jest
      .fn()
      .mockReturnValueOnce(firstJobPromise)
      .mockResolvedValueOnce(undefined)
    queue.addExecutor('TEST', executor)

    const p1 = queue.process('job-1', 'TEST', {})
    const p2 = queue.process('job-2', 'TEST', {})

    queue.cancel('job-1', 'TEST')

    await expect(p1).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
      name: 'JobCancelledError',
    })
    expect(executor).toHaveBeenCalledTimes(1)
    expect(queue.getRunningJobs().length).toBe(1)
    expect(queue.getReadyJobs().length).toBe(1)

    resolveFirstJob()
    await p2

    expect(executor).toHaveBeenCalledTimes(2)
  })

  it('keeps shared work running when one subscriber aborts', async () => {
    const queue = new Queue({ concurrency: 1 })
    const firstSubscriber = new AbortController()
    const secondSubscriber = new AbortController()
    const cancelExecutor = jest.fn()
    let resolveJob: (value: string) => void = () => {}
    const jobPromise = new Promise<string>(resolve => {
      resolveJob = resolve
    }) as Promise<string> & { cancel?: () => void }
    jobPromise.cancel = cancelExecutor

    queue.addExecutor('TEST', () => jobPromise)

    const firstResult = queue.process<string, object>(
      'shared-job',
      'TEST',
      {},
      {
        signal: firstSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )
    const secondResult = queue.process<string, object>(
      'shared-job',
      'TEST',
      {},
      {
        signal: secondSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )

    firstSubscriber.abort()

    await expect(firstResult).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(cancelExecutor).not.toHaveBeenCalled()

    resolveJob('result')

    await expect(secondResult).resolves.toBe('result')
    expect(cancelExecutor).not.toHaveBeenCalled()
  })

  it('cancels shared work after its final subscriber aborts', async () => {
    const queue = new Queue({ concurrency: 1 })
    const firstSubscriber = new AbortController()
    const secondSubscriber = new AbortController()
    const cancelExecutor = jest.fn()
    const jobPromise = new Promise(() => {}) as Promise<never> & {
      cancel?: () => void
    }
    jobPromise.cancel = cancelExecutor

    queue.addExecutor('TEST', () => jobPromise)

    const firstResult = queue.process(
      'shared-job',
      'TEST',
      {},
      {
        signal: firstSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )
    const secondResult = queue.process(
      'shared-job',
      'TEST',
      {},
      {
        signal: secondSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )

    firstSubscriber.abort()
    await expect(firstResult).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(cancelExecutor).not.toHaveBeenCalled()

    secondSubscriber.abort()
    await expect(secondResult).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(cancelExecutor).toHaveBeenCalledTimes(1)
  })

  it('aborts a non-cancelable executor after its final subscriber leaves', async () => {
    const queue = new Queue({ concurrency: 1 })
    const firstSubscriber = new AbortController()
    const secondSubscriber = new AbortController()
    let executorSignal: globalThis.AbortSignal | undefined
    let rejectExecution: (error: Error) => void = () => {}
    const execution = new Promise((_resolve, reject) => {
      rejectExecution = reject
    })

    queue.addExecutor('TEST', (_params, { signal }) => {
      executorSignal = signal
      return execution
    })

    const firstResult = queue.process(
      'shared-job',
      'TEST',
      {},
      {
        signal: firstSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )
    const secondResult = queue.process(
      'shared-job',
      'TEST',
      {},
      {
        signal: secondSubscriber.signal as unknown as globalThis.AbortSignal,
      }
    )

    firstSubscriber.abort()
    await expect(firstResult).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(executorSignal?.aborted).toBe(false)

    secondSubscriber.abort()
    await expect(secondResult).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(executorSignal?.aborted).toBe(true)
    expect(queue.getRunningJobs()).toHaveLength(1)

    rejectExecution(new Error('executor stopped'))
    await execution.catch(() => {})
    await Promise.resolve()

    expect(queue.getRunningJobs()).toHaveLength(0)
  })

  it('does not enqueue work for an already aborted subscriber', async () => {
    const queue = new Queue({ concurrency: 1 })
    const subscriber = new AbortController()
    const executor = jest.fn()
    subscriber.abort()
    queue.addExecutor('TEST', executor)

    const result = queue.process(
      'job',
      'TEST',
      {},
      {
        signal: subscriber.signal as unknown as globalThis.AbortSignal,
      }
    )

    await expect(result).rejects.toMatchObject({
      code: 'JOB_CANCELLED',
    })
    expect(executor).not.toHaveBeenCalled()
    expect(queue.getReadyJobs()).toHaveLength(0)
    expect(queue.getRunningJobs()).toHaveLength(0)
  })
})
