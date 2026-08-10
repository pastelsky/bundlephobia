import gitURLParse from 'git-url-parse'

import { getOrLoadTrendsData } from '../cache'
import { npmRegistryClient } from '../clients/http'

// Known org/repo renames where GitHub Archive / ClickHouse dataset uses historical names
const KNOWN_REPO_ALIASES: Record<string, string> = {
  'react/react': 'facebook/react',
  'reactjs/redux': 'reduxjs/redux',
  'zeit/next.js': 'vercel/next.js',
  'snowpackjs/astro': 'withastro/astro',
}

function normalizeGithubUrl(raw: unknown): string | null {
  if (!raw) {
    return null
  }

  let rawString = ''
  if (typeof raw === 'string') {
    rawString = raw
  } else if (typeof raw === 'object' && raw !== null && 'url' in raw) {
    rawString = String((raw as { url?: string }).url || '')
  }

  if (!rawString) {
    return null
  }

  try {
    const parsed = gitURLParse(rawString)
    if (parsed.owner && parsed.name) {
      if (!parsed.source || parsed.source.includes('github')) {
        return `${parsed.owner}/${parsed.name}`
      }
    }
  } catch {
    // Fallback regex parsing if git-url-parse throws
    const cleaned = rawString
      .replace(/^git\+/, '')
      .replace(/^ssh:\/\//, 'https://')
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\.git$/, '')

    const match = cleaned.match(
      /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i
    )

    if (match && match[1] && match[2]) {
      const owner = match[1]
      const name = match[2].replace(/\/.*$/, '')
      return `${owner}/${name}`
    }
  }

  return null
}

export async function resolveGithubRepo(
  packageName: string
): Promise<string | null> {
  const cacheKey = `gh-repo:${packageName}`
  return getOrLoadTrendsData(
    'repository',
    cacheKey,
    24 * 60 * 60 * 1000,
    async () => {
      try {
        const { data } = await npmRegistryClient.get(
          `/${encodeURIComponent(packageName)}`
        )

        const latest =
          data?.['dist-tags']?.latest &&
          data?.versions?.[data['dist-tags'].latest]
        const candidates: Array<string | null> = [
          normalizeGithubUrl(latest?.repository),
          normalizeGithubUrl(data?.repository),
          normalizeGithubUrl(latest?.bugs?.url),
          normalizeGithubUrl(data?.bugs?.url),
          normalizeGithubUrl(latest?.homepage),
          normalizeGithubUrl(data?.homepage),
        ]

        if (data?.versions && typeof data.versions === 'object') {
          const versionKeys = Object.keys(data.versions).slice(-10).reverse()
          for (const vKey of versionKeys) {
            const repository = normalizeGithubUrl(
              data.versions[vKey]?.repository
            )
            if (repository) {
              candidates.push(repository)
              break
            }
          }
        }

        const repository = candidates.find((c): c is string => Boolean(c))
        return repository ? KNOWN_REPO_ALIASES[repository] || repository : null
      } catch {
        return null
      }
    }
  )
}
