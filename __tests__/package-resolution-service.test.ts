import {
  createRequestedPackage,
  createResolvedPackage,
} from '../server/services/packageResolution.service'

describe('package resolution', () => {
  it('normalizes package metadata for every server workflow', () => {
    expect(
      createResolvedPackage(createRequestedPackage('@scope/pkg'), {
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
    const resolved = createResolvedPackage(createRequestedPackage('example'), {
      name: 'example',
      version: '1.0.0',
      description: 'x'.repeat(301),
      repository: 'not a repository URL',
    })

    expect(resolved.description).toHaveLength(301)
    expect(resolved.description.endsWith('…')).toBe(true)
    expect(resolved.repository).toBe('')
  })
})
