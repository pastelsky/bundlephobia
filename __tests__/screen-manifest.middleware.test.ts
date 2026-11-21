import screenManifestMiddleware from '../server/middlewares/results/screen-manifest.middleware'

describe('screenManifestMiddleware', () => {
  it('allows valid package manifests and continues downstream', async () => {
    const next = jest.fn(async () => {})

    const ctx = {
      query: {},
      state: {
        packageManifest: {
          name: 'react',
          version: '19.2.0',
          exports: { '.': './index.js' },
        },
      },
    }

    // SAFETY: this fixture provides the middleware fields exercised by the test.
    await screenManifestMiddleware(ctx as never, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects unbuildable manifests via package-build-stats/preflight', async () => {
    const next = jest.fn(async () => {})

    const ctx = {
      query: {},
      state: {
        packageManifest: {
          name: 'subpath-cli',
          version: '1.0.0',
          bin: { cli: './cli.js' },
          exports: { './package.json': './package.json' },
        },
      },
    }

    await expect(
      // SAFETY: this fixture provides the middleware fields exercised by the test.
      screenManifestMiddleware(ctx as never, next),
    ).rejects.toMatchObject({ name: 'CLIBuildError' })

    expect(next).not.toHaveBeenCalled()
  })

  it('skips screening when force=true', async () => {
    const next = jest.fn(async () => {})

    const ctx = {
      query: { force: 'true' },
      state: {
        packageManifest: {
          name: 'mac-only',
          version: '1.0.0',
          os: ['darwin'],
        },
      },
    }

    // SAFETY: this fixture provides the middleware fields exercised by the test.
    await screenManifestMiddleware(ctx as never, next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})
