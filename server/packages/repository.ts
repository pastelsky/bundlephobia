import gitURLParse from 'git-url-parse'

export type RepositoryField = string | { url?: string }

function repositoryString(repository: RepositoryField | undefined): string {
  return typeof repository === 'string' ? repository : (repository?.url ?? '')
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
    if (
      parsed.owner &&
      parsed.name &&
      (!parsed.source || parsed.source.includes('github'))
    ) {
      return `${parsed.owner}/${parsed.name}`
    }
  } catch {
    return null
  }

  return null
}

export function isGithubRepository(repository: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
}
