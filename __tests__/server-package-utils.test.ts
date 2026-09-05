import {
  getEscapedNpmPackageName,
  parseNpmRegistryPackageSpec,
} from '../server/packages/npmPackage'
import {
  isGithubRepository,
  normalizeRepositoryUrl,
  parseGithubRepository,
} from '../server/packages/repository'

describe('server package utilities', () => {
  it.each([
    ['react', 'react'],
    ['@babel/core', '@babel%2fcore'],
    ['alias@npm:@babel/core@^7', '@babel%2fcore'],
  ])('uses npm-package-arg to escape %s', (specifier, escapedName) => {
    expect(getEscapedNpmPackageName(specifier)).toBe(escapedName)
  })

  it('rejects non-registry package specs at registry boundaries', () => {
    expect(parseNpmRegistryPackageSpec('github:facebook/react')).toBeNull()
    expect(() => getEscapedNpmPackageName('github:facebook/react')).toThrow(
      'Expected an npm registry package',
    )
  })

  it.each([
    ['git+https://github.com/facebook/react.git', 'facebook/react'],
    ['git@github.com:vuejs/core.git', 'vuejs/core'],
    [{ url: 'https://github.com/expressjs/express' }, 'expressjs/express'],
    ['https://gitlab.com/example/project', null],
    ['https://notgithub.com/example/project', null],
  ])('extracts a GitHub repository from %p', (repository, expected) => {
    expect(parseGithubRepository(repository)).toBe(expected)
  })

  it('normalizes repository URLs for package analysis', () => {
    expect(normalizeRepositoryUrl('git@github.com:vuejs/core.git')).toBe(
      'https://github.com/vuejs/core.git',
    )
  })

  it.each([
    ['facebook/react', true],
    ['vercel/next.js', true],
    ['facebook/react/extra', false],
    ["facebook/react' OR 1=1", false],
  ])('validates GitHub repository slug %s', (repository, expected) => {
    expect(isGithubRepository(repository)).toBe(expected)
  })
})
