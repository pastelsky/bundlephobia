import {
  BuildCircuitBreaker,
  readBuildFilesystem,
  type DiskHeadroom,
} from '../server/infrastructure/build-circuit-breaker'

const GiB = 1024 ** 3

const healthy: DiskHeadroom = {
  scratchBytes: 12 * GiB,
  rootBytes: 12 * GiB,
  scratchInodes: 0.5,
  rootInodes: 0.5,
}

describe('emergency disk admission', () => {
  it.each([
    { scratchBytes: 4 * GiB },
    { rootBytes: 4 * GiB },
    { scratchInodes: 0.09 },
    { rootInodes: 0.09 },
  ])(
    'opens once for low headroom %o and needs sustained recovery',
    async pressure => {
      let time = 0
      let disk = { ...healthy, ...pressure }
      const transition = jest.fn()

      const breaker = new BuildCircuitBreaker(
        async () => disk,
        transition,
        () => time,
      )

      expect(await breaker.check()).toBe(true)
      time += 5000
      expect(await breaker.check()).toBe(true)
      expect(transition).toHaveBeenCalledTimes(1)
      disk = healthy
      time += 5000
      expect(await breaker.check()).toBe(true)
      time += 59_000
      expect(await breaker.check()).toBe(true)
      time += 5000
      expect(await breaker.check()).toBe(false)
      expect(transition).toHaveBeenLastCalledWith(false, 'disk_pressure')
    },
  )

  it('resets the recovery interval when pressure returns', async () => {
    let time = 0
    let disk = { ...healthy, scratchBytes: GiB }

    const breaker = new BuildCircuitBreaker(
      async () => disk,
      jest.fn(),
      () => time,
    )

    await breaker.check()
    disk = healthy
    time = 5000
    await breaker.check()
    disk = { ...healthy, scratchBytes: 6 * GiB }
    time = 50_000
    await breaker.check()
    disk = healthy
    time = 65_000
    expect(await breaker.check()).toBe(true)
    time = 125_000
    expect(await breaker.check()).toBe(false)
  })

  it('shares concurrent samples and fails closed if disk checks fail', async () => {
    const read = jest.fn(async (): Promise<DiskHeadroom> => {
      throw new Error('unavailable')
    })

    const transition = jest.fn()
    const breaker = new BuildCircuitBreaker(read, transition)
    expect(await Promise.all([breaker.check(), breaker.check()])).toEqual([
      true,
      true,
    ])
    expect(read).toHaveBeenCalledTimes(1)
    expect(transition).toHaveBeenCalledWith(true, 'disk_check_failed')
  })
})

it('checks the containing filesystem before the scratch directory is created', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })

  const read = jest
    .fn()
    .mockRejectedValueOnce(missing)
    .mockResolvedValueOnce({ bavail: 123 })

  await expect(readBuildFilesystem('/tmp/not-created', read)).resolves.toEqual({
    bavail: 123,
  })
  expect(read.mock.calls).toEqual([['/tmp/not-created'], ['/tmp']])
})

it('does not hide permission or I/O errors by checking a different directory', async () => {
  const error = Object.assign(new Error('denied'), { code: 'EACCES' })
  const read = jest.fn().mockRejectedValue(error)
  await expect(readBuildFilesystem('/tmp/scratch', read)).rejects.toBe(error)
  expect(read).toHaveBeenCalledTimes(1)
})
