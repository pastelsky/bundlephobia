const {
  resolveRegistryPackageSpec,
  UnsupportedRegistryPackageSpecError,
} = require('../installation-service/resolveRegistryPackageSpec.cjs')

describe('installation service package spec resolution', () => {
  it.each([
    ['@scope/example@1.2.3', '@scope/example@1.2.3'],
    ['example@v1.2.3', 'example@1.2.3'],
    ['example@=1.2.3', 'example@1.2.3'],
  ])(
    'canonicalizes exact version %s without a registry lookup',
    async (packageString, expected) => {
      const manifest = jest.fn()

      await expect(
        resolveRegistryPackageSpec(packageString, manifest)
      ).resolves.toBe(expected)
      expect(manifest).not.toHaveBeenCalled()
    }
  )

  it.each(['latest', '^4.0.0'])(
    'resolves the %s spec before installation',
    async requestedVersion => {
      const manifest = jest.fn().mockResolvedValue({
        name: 'date-fns',
        version: '4.1.0',
      })

      await expect(
        resolveRegistryPackageSpec(`date-fns@${requestedVersion}`, manifest)
      ).resolves.toBe('date-fns@4.1.0')
      expect(manifest).toHaveBeenCalledWith(`date-fns@${requestedVersion}`, {
        fullMetadata: false,
      })
    }
  )

  it.each(['file:../package', 'github:user/repository'])(
    'rejects the non-registry spec %s',
    async packageString => {
      await expect(
        resolveRegistryPackageSpec(packageString)
      ).rejects.toBeInstanceOf(UnsupportedRegistryPackageSpecError)
    }
  )
})
