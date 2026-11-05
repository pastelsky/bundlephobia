import { checkPackageFootprint } from '../installation-service/checkPackageFootprint.ts'

describe('published package installation limits', () => {
  it.each([
    { unpackedSize: 200 * 1024 * 1024 + 1, fileCount: 2 },
    { unpackedSize: 4_000_000, fileCount: 50_001 },
  ])('rejects an oversized archive: %j', async dist => {
    const manifest = jest.fn().mockResolvedValue({ dist })

    await expect(
      checkPackageFootprint('example@1.0.0', undefined, manifest),
    ).rejects.toMatchObject({
      name: 'UnsupportedPackageError',
      cause: 'example@1.0.0',
      message: expect.stringContaining('200 MiB or 50,000 files'),
    })
  })

  it.each([
    { dist: { unpackedSize: 200 * 1024 * 1024, fileCount: 50_000 } },
    // Useful browser packages can have many files or large assets.
    { dist: { unpackedSize: 174_100_000, fileCount: 47_238 } },
    {},
    { dist: { unpackedSize: 'unknown', fileCount: -1 } },
  ])(
    'allows supported boundaries and unavailable measurements: %j',
    async data => {
      const manifest = jest.fn().mockResolvedValue(data)

      await expect(
        checkPackageFootprint('example@1.0.0', undefined, manifest),
      ).resolves.toBeUndefined()
    },
  )

  it('does not misclassify registry failures as oversized packages', async () => {
    const error = new Error('registry unavailable')

    const manifest = jest.fn().mockRejectedValue(error)

    await expect(
      checkPackageFootprint('example@1.0.0', undefined, manifest),
    ).rejects.toBe(error)
    expect(manifest).toHaveBeenCalledWith(
      'example@1.0.0',
      expect.objectContaining({
        preferOffline: true,
        timeout: 10_000,
        fetchRetries: 0,
      }),
    )
  })

  it('does not fetch metadata for a cancelled install or continue after cancellation', async () => {
    const controller = new AbortController()

    const manifest = jest.fn(async () => {
      controller.abort()

      return { dist: { unpackedSize: 1, fileCount: 1 } }
    })

    await expect(
      checkPackageFootprint('example@1.0.0', controller.signal, manifest),
    ).rejects.toMatchObject({ name: 'AbortError' })

    manifest.mockClear()

    await expect(
      checkPackageFootprint('example@1.0.0', controller.signal, manifest),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(manifest).not.toHaveBeenCalled()
  })
})
