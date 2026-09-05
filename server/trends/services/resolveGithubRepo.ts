import { fetchPackagePackument } from '../../clients/npmRegistry'
import { parseGithubRepository } from '../../packages/repository'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import { canonicalGithubRepository } from '../repositories'

export async function resolveGithubRepo(
  packageName: string,
): Promise<string | null> {
  const cacheKey = `gh-repo:${packageName}`
  return getOrLoadTrendsData(
    'repository',
    cacheKey,
    trendsConfig.cacheTtlMs.repository,
    async () => {
      try {
        const packument = await fetchPackagePackument(packageName)

        const latestVersion = packument['dist-tags']?.latest
        const latest = latestVersion
          ? packument.versions?.[latestVersion]
          : undefined
        const repository =
          parseGithubRepository(latest?.repository) ||
          parseGithubRepository(packument.repository)
        return repository ? canonicalGithubRepository(repository) : null
      } catch {
        return null
      }
    },
  )
}
