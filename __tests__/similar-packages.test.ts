import {
  parseAlgoliaPackage,
  getReadme,
} from '../server/middlewares/similar-packages/similar-packages.middleware'

describe('similar packages boundary resilience', () => {
  it('safely handles packages where repository is null without crashing readme resolution', async () => {
    // Regression test for production TypeError: Cannot destructure property 'host' of 'repository' as it is null
    const payload = {
      name: '@blocksuite/store',
      description: 'BlockSuite store package',
      keywords: ['editor', 'crdt'],
      repository: null,
    }

    const parsed = parseAlgoliaPackage(payload)

    expect(parsed.description).toBe('BlockSuite store package')
    expect(parsed.keywords).toEqual(['editor', 'crdt'])
    expect(parsed.repository).toBeNull()

    // getReadme must safely return undefined rather than detonating on null repository
    await expect(getReadme(parsed.repository)).resolves.toBeUndefined()
  })

  it('preserves unmodeled upstream metadata fields (passthrough) without breaking validation', () => {
    // Verifies that future or additional properties returned by upstream APIs do not fail validation
    const payload = {
      name: 'lodash',
      description: 'Lodash modular utilities',
      keywords: ['modules', 'stdlib', 'util'],
      readme: '# Lodash',
      repository: {
        host: 'github.com',
        user: 'lodash',
        project: 'lodash',
        branch: 'main',
        path: '',
        head: 'main',
        customFutureField: 123,
      },
      downloadsLast30Days: 999999,
      maintainers: [{ name: 'jdalton' }],
    }

    const parsed = parseAlgoliaPackage(payload)

    expect(parsed.description).toBe('Lodash modular utilities')
    expect(parsed.repository?.host).toBe('github.com')
    expect(parsed.repository?.['customFutureField']).toBe(123)
    expect(parsed['downloadsLast30Days']).toBe(999999)
  })

  it('heals gracefully on upstream schema drift without throwing 500 errors', () => {
    // Verifies that malformed or shifted types from external APIs heal to safe defaults
    const payload = {
      name: 'broken-package',
      description: 12345,
      keywords: 'not-an-array',
      repository: 'not-an-object',
    }

    // @ts-expect-error - deliberate malformed payload to test runtime boundary healing
    const parsed = parseAlgoliaPackage(payload)

    expect(parsed).toEqual({})
  })
})
