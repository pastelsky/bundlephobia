import axios from 'axios'
import gitURLParse from 'git-url-parse'

import { getCached, setCached } from './memoryCache'

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
  const cached = getCached<string | null>(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    const { data } = await axios.get(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
      {
        timeout: 12_000,
        headers: { Accept: 'application/json' },
      }
    )

    const latest =
      data?.['dist-tags']?.latest && data?.versions?.[data['dist-tags'].latest]

    // Gather candidate repository URLs from all metadata fields
    const candidates: Array<string | null> = [
      normalizeGithubUrl(latest?.repository),
      normalizeGithubUrl(data?.repository),
      normalizeGithubUrl(latest?.bugs?.url),
      normalizeGithubUrl(data?.bugs?.url),
      normalizeGithubUrl(latest?.homepage),
      normalizeGithubUrl(data?.homepage),
    ]

    // Search recent versions if latest had no repository info
    if (data?.versions && typeof data.versions === 'object') {
      const versionKeys = Object.keys(data.versions).slice(-10).reverse()
      for (const vKey of versionKeys) {
        const vRepo = normalizeGithubUrl(data.versions[vKey]?.repository)
        if (vRepo) {
          candidates.push(vRepo)
          break
        }
      }
    }

    let repository = candidates.find((c): c is string => Boolean(c)) || null

    if (repository && KNOWN_REPO_ALIASES[repository]) {
      repository = KNOWN_REPO_ALIASES[repository]
    }

    setCached(cacheKey, repository, 24 * 60 * 60 * 1000)
    return repository
  } catch {
    setCached(cacheKey, null, 30 * 60 * 1000)
    return null
  }
}
