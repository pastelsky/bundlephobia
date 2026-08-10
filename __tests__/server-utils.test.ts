const registryFetch = require('npm-registry-fetch')
const pacote = require('pacote')

jest.mock('npm-registry-fetch', () => ({ json: jest.fn() }))
jest.mock('pacote', () => ({ manifest: jest.fn() }))
jest.mock('../server/api/BuildService', () => ({
  __esModule: true,
  default: jest.fn(),
}))

import { createJavaScriptPackageReference } from '../languages/javascript'
import { JavaScriptPackageAnalysisAdapter } from '../server/analysis/javascript/JavaScriptPackageAnalysisAdapter'

const adapter = new JavaScriptPackageAnalysisAdapter({} as never)
const resolvePackage = (specifier: string) =>
  adapter.resolvePackage(createJavaScriptPackageReference(specifier))

describe('resolvePackage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['next', '/next/latest'],
    ['next@15.0.0', '/next/15.0.0'],
    ['next@v15.0.0', '/next/15.0.0'],
    ['next@canary', '/next/canary'],
    ['@babel/core', '/@babel%2fcore/latest'],
    ['next-alias@npm:next@15.0.0', '/next/15.0.0'],
  ])('fetches one manifest for %s', async (packageString, expectedPath) => {
    registryFetch.json.mockResolvedValue({ name: 'next', version: '15.0.0' })

    await expect(resolvePackage(packageString)).resolves.toMatchObject({
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

  it('uses abbreviated metadata to resolve an aliased semver range', async () => {
    pacote.manifest.mockResolvedValue({ name: 'react', version: '18.3.1' })
    registryFetch.json.mockResolvedValue({ name: 'react', version: '18.3.1' })

    await resolvePackage('legacy-react@npm:react@^18')

    expect(pacote.manifest).toHaveBeenCalledWith('legacy-react@npm:react@^18', {
      fullMetadata: false,
    })
    expect(registryFetch.json).toHaveBeenCalledWith('/react/18.3.1')
  })

  it('preserves Pacote resolution for non-registry specs', async () => {
    pacote.manifest.mockResolvedValue({ name: 'react', version: '18.2.0' })

    await expect(
      resolvePackage('github:facebook/react'),
    ).resolves.toMatchObject({
      name: 'react',
      version: '18.2.0',
    })
    expect(pacote.manifest).toHaveBeenCalledWith('github:facebook/react', {
      fullMetadata: true,
    })
    expect(registryFetch.json).not.toHaveBeenCalled()
  })

  it('reports a missing version when the package itself exists', async () => {
    registryFetch.json
      .mockRejectedValueOnce({ code: 'E404' })
      .mockResolvedValueOnce({ name: 'react', version: '19.1.1' })

    await expect(resolvePackage('react@99.0.0')).rejects.toMatchObject({
      name: 'PackageVersionMismatchError',
      extra: { suggestedVersion: '19.1.1' },
    })
  })

  it('reports a package that does not exist', async () => {
    registryFetch.json.mockRejectedValue({ code: 'E404' })

    await expect(
      resolvePackage('definitely-not-a-real-package'),
    ).rejects.toMatchObject({
      name: 'PackageNotFoundError',
    })
  })
})
