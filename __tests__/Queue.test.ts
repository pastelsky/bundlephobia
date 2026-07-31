import Queue from '../server/Queue'

describe('Queue cancellation', () => {
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
})
