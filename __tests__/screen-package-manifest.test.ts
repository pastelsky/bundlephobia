import {
  MAX_UNPACKED_PACKAGE_BYTES,
  screenPackageManifest,
} from '../server/packages/screen-package-manifest'

describe('screenPackageManifest', () => {
  it('allows ordinary valid frontend packages', () => {
    expect(() =>
      screenPackageManifest(
        {
          name: 'react',
          version: '19.2.0',
          exports: { '.': './index.js', './jsx-runtime': './jsx-runtime.js' },
          dist: { unpackedSize: 200_000 },
        },
        'linux',
        'x64',
      ),
    ).not.toThrow()

    expect(() =>
      screenPackageManifest(
        {
          name: 'legacy-implicit-index',
          version: '1.0.0',
          bin: './cli.js',
        },
        'linux',
        'x64',
      ),
    ).not.toThrow()

    expect(() =>
      screenPackageManifest(
        {
          name: 'conditions-exports',
          version: '1.0.0',
          exports: { import: './esm.js', default: './cjs.js' },
        },
        'linux',
        'x64',
      ),
    ).not.toThrow()
  })

  it('rejects packages whose os or cpu constraints exclude the build host', () => {
    expect(() =>
      screenPackageManifest(
        { name: 'mac-only', version: '1.0.0', os: ['darwin'] },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'UnsupportedPackageError' }))

    expect(() =>
      screenPackageManifest(
        { name: 'no-linux', version: '1.0.0', os: ['!linux'] },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'UnsupportedPackageError' }))

    expect(() =>
      screenPackageManifest(
        { name: 'arm-only', version: '1.0.0', cpu: ['arm64'] },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'UnsupportedPackageError' }))

    expect(() =>
      screenPackageManifest(
        {
          name: 'linux-ok',
          version: '1.0.0',
          os: ['darwin', 'linux'],
          cpu: ['!arm64'],
        },
        'linux',
        'x64',
      ),
    ).not.toThrow()
  })

  it('rejects packages exceeding the unpacked size limit', () => {
    expect(() =>
      screenPackageManifest(
        {
          name: 'ffprobe-static',
          version: '3.1.0',
          dist: { unpackedSize: MAX_UNPACKED_PACKAGE_BYTES + 1 },
        },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'UnsupportedPackageError' }))
  })

  it('rejects subpath-map exports that omit root "."', () => {
    expect(() =>
      screenPackageManifest(
        {
          name: 'subpath-only-lib',
          version: '1.0.0',
          exports: {
            './package.json': './package.json',
            './utils': './utils.js',
          },
        },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'EntryPointError' }))

    expect(() =>
      screenPackageManifest(
        {
          name: 'subpath-cli',
          version: '1.0.0',
          bin: { cli: './bin.js' },
          exports: { './package.json': './package.json' },
        },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'CLIBuildError' }))
  })

  it('rejects exports whose root target only contains TypeScript types', () => {
    expect(() =>
      screenPackageManifest(
        {
          name: 'types-only-pkg',
          version: '1.0.0',
          exports: { '.': { types: './index.d.ts' } },
        },
        'linux',
        'x64',
      ),
    ).toThrow(expect.objectContaining({ name: 'EntryPointError' }))
  })
})
