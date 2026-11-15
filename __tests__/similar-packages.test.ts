import {
  parseAlgoliaPackage,
  getReadme,
  type RepositoryInfo,
} from '../server/middlewares/similar-packages/similar-packages.middleware'

describe('similar packages boundary resilience', () => {
  describe('parseAlgoliaPackage', () => {
    it('returns empty object when payload is undefined or null', () => {
      expect(parseAlgoliaPackage(undefined)).toEqual({})
      expect(parseAlgoliaPackage(null)).toEqual({})
    })

    it('safely handles packages where repository is null', () => {
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
    })

    it('safely parses valid repository info while preserving unknown upstream fields', () => {
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
      }

      const parsed = parseAlgoliaPackage(payload)
      expect(parsed.description).toBe('Lodash modular utilities')
      expect(parsed.keywords).toEqual(['modules', 'stdlib', 'util'])
      expect(parsed.readme).toBe('# Lodash')
      expect(parsed.repository?.host).toBe('github.com')
      expect(parsed.repository?.user).toBe('lodash')
      expect(parsed.repository?.project).toBe('lodash')
      expect(parsed.repository?.branch).toBe('main')
      // Passthrough preserves future upstream properties without breaking
      expect(parsed.repository?.['customFutureField']).toBe(123)
      expect(parsed['downloadsLast30Days']).toBe(999999)
    })

    it('heals gracefully when unexpected shapes are supplied', () => {
      const payload = {
        name: 'broken-package',
        description: 12345, // invalid description type
        keywords: 'not-an-array', // invalid keywords type
        repository: 'not-an-object', // invalid repository type
      }

      // @ts-expect-error - deliberate malformed payload to test runtime boundary healing
      const parsed = parseAlgoliaPackage(payload)
      expect(parsed).toEqual({})
    })
  })

  describe('getReadme', () => {
    it('returns undefined when repository is null or undefined without throwing TypeError', async () => {
      await expect(getReadme(null)).resolves.toBeUndefined()
      await expect(getReadme(undefined)).resolves.toBeUndefined()
    })

    it('returns undefined when repository is missing host, user, or project', async () => {
      const missingHost: RepositoryInfo = {
        user: 'foo',
        project: 'bar',
      }

      const missingUser: RepositoryInfo = {
        host: 'github.com',
        project: 'bar',
      }

      const missingProject: RepositoryInfo = {
        host: 'github.com',
        user: 'foo',
      }

      await expect(getReadme(missingHost)).resolves.toBeUndefined()
      await expect(getReadme(missingUser)).resolves.toBeUndefined()
      await expect(getReadme(missingProject)).resolves.toBeUndefined()
    })

    it('returns undefined when host is unknown without throwing', async () => {
      const unsupportedHost: RepositoryInfo = {
        host: 'unknown-git-host.com',
        user: 'foo',
        project: 'bar',
      }

      await expect(getReadme(unsupportedHost)).resolves.toBeUndefined()
    })
  })
})
