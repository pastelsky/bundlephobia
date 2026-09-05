import gitURLParse from 'git-url-parse'

import type { RepositoryField } from '../clients/npmRegistry'

export function parseGithubRepository(
  repository: RepositoryField | undefined,
): string | null {
  const raw = typeof repository === 'string' ? repository : repository?.url
  if (!raw) return null

  try {
    const parsed = gitURLParse(raw)
    if (parsed.source !== 'github.com' || !parsed.owner || !parsed.name) {
      return null
    }
    return `${parsed.owner}/${parsed.name}`
  } catch {
    return null
  }
}
