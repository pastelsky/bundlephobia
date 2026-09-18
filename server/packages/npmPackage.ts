import gitURLParse from 'git-url-parse'
import parsePackageSpec from 'npm-package-arg'

export type RepositoryField = string | { url?: string }

export type NpmRegistryPackageSpec = parsePackageSpec.RegistryResult & {
  name: string
  escapedName: string
}

function isAliasPackageSpec(
  spec: parsePackageSpec.Result,
): spec is parsePackageSpec.AliasResult {
  return spec.type === 'alias'
}

function isRegistryPackageSpec(
  spec: parsePackageSpec.Result,
): spec is NpmRegistryPackageSpec {
  return spec.registry && Boolean(spec.name) && Boolean(spec.escapedName)
}

/** Resolves npm aliases to the registry package they target. */
export function parseNpmRegistryPackageSpec(
  packageSpecifier: string,
): NpmRegistryPackageSpec | null {
  const parsed = parsePackageSpec(packageSpecifier)
  const target = isAliasPackageSpec(parsed) ? parsed.subSpec : parsed

  return isRegistryPackageSpec(target) ? target : null
}

/** Returns npm's canonical escaped package name for use in npm API paths. */
export function getEscapedNpmPackageName(packageSpecifier: string): string {
  const packageSpec = parseNpmRegistryPackageSpec(packageSpecifier)

  if (!packageSpec) {
    throw new TypeError(`Expected an npm registry package: ${packageSpecifier}`)
  }

  return packageSpec.escapedName
}

function repositoryString(repository: RepositoryField | undefined): string {
  if (!repository) {
    return ''
  }

  return hasRepositoryUrl(repository) ? (repository.url ?? '') : repository
}

function hasRepositoryUrl(
  repository: RepositoryField,
): repository is { url?: string } {
  return Object.prototype.toString.call(repository) === '[object Object]'
}

export function normalizeRepositoryUrl(
  repository: RepositoryField | undefined,
): string {
  const value = repositoryString(repository)

  if (!value) return ''

  try {
    return gitURLParse(value).toString('https')
  } catch {
    return ''
  }
}

export function parseGithubRepository(
  repository: RepositoryField | undefined,
): string | null {
  const value = repositoryString(repository)

  if (!value) return null

  try {
    const parsed = gitURLParse(value)

    if (parsed.owner && parsed.name && parsed.source === 'github.com') {
      return `${parsed.owner}/${parsed.name}`
    }
  } catch {
    return null
  }

  return null
}
