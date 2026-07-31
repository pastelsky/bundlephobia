const registryFetch = require('npm-registry-fetch')
const pacote = require('pacote')

jest.mock('npm-registry-fetch', () => ({ json: jest.fn() }))
jest.mock('pacote', () => ({ manifest: jest.fn() }))

import { resolvePackage } from '../utils/server.utils'

describe('resolvePackage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['next', '/next/latest'],
    ['next@15.0.0', '/next/15.0.0'],
    ['next@canary', '/next/canary'],
    ['@babel/core', '/@babel%2fcore/latest'],
  ])('fetches one manifest for %s', async (packageString, expectedPath) => {
    registryFetch.json.mockResolvedValue({ name: 'next', version: '15.0.0' })

    await expect(resolvePackage(packageString)).resolves.toEqual({
      name: 'next',
      version: '15.0.0',
    })
    expect(registryFetch.json).toHaveBeenCalledWith(expectedPath)
    expect(pacote.manifest).not.toHaveBeenCalled()
  })

  it('uses abbreviated metadata only to resolve a semver range', async () => {
    pacote.manifest.mockResolvedValue({ name: 'next', version: '15.5.9' })
    registryFetch.json.mockResolvedValue({
      name: 'next',
      version: '15.5.9',
      repository: { url: 'https://github.com/vercel/next.js' },
    })

    await resolvePackage('next@^15.0.0')

    expect(pacote.manifest).toHaveBeenCalledWith('next@^15.0.0', {
      fullMetadata: false,
    })
    expect(registryFetch.json).toHaveBeenCalledWith('/next/15.5.9')
  })

  it('reports a missing version when the package itself exists', async () => {
    registryFetch.json
      .mockRejectedValueOnce({ code: 'E404' })
      .mockResolvedValueOnce({ name: 'react', version: '19.1.1' })

    await expect(resolvePackage('react@99.0.0')).rejects.toMatchObject({
      name: 'PackageVersionMismatchError',
      extra: { validVersions: ['19.1.1'] },
    })
  })

  it('reports a package that does not exist', async () => {
    registryFetch.json.mockRejectedValue({ code: 'E404' })

    await expect(
      resolvePackage('definitely-not-a-real-package')
    ).rejects.toMatchObject({
      name: 'PackageNotFoundError',
    })
  })
})
