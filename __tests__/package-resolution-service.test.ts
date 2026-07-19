import {
  createPackageRequest,
  createResolvedPackage,
} from '../server/services/packageResolution.service'

describe('package resolution', () => {
  it('normalizes package metadata for every server workflow', () => {
    expect(
      createResolvedPackage(createPackageRequest('@scope/pkg'), {
        name: '@scope/pkg',
        version: '1.2.3',
        description: 'Package description',
        repository: {
          url: 'git+https://github.com/example/package.git',
        },
      })
    ).toEqual({
      name: '@scope/pkg',
      version: '1.2.3',
      scoped: true,
      packageString: '@scope/pkg@1.2.3',
      description: 'Package description',
      repository: 'https://github.com/example/package.git',
    })
  })

  it('bounds descriptions and tolerates malformed repository metadata', () => {
    const resolved = createResolvedPackage(createPackageRequest('example'), {
      name: 'example',
      version: '1.0.0',
      description: 'x'.repeat(301),
      repository: 'not a repository URL',
    })

    expect(resolved.description).toBe(`${'x'.repeat(300)}…`)
    expect(resolved.repository).toBeNull()
  })

  it('represents blank optional metadata as null', () => {
    const resolved = createResolvedPackage(createPackageRequest('example'), {
      name: 'example',
      version: '1.0.0',
      description: '   ',
      repository: { url: '   ' },
    })

    expect(resolved.description).toBeNull()
    expect(resolved.repository).toBeNull()
  })
})
