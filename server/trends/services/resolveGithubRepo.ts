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
        const candidates: Array<string | null> = [
          parseGithubRepository(latest?.repository),
          parseGithubRepository(packument.repository),
          parseGithubRepository(latest?.bugs),
          parseGithubRepository(packument.bugs),
          parseGithubRepository(latest?.homepage),
          parseGithubRepository(packument.homepage),
        ]

        if (packument.versions) {
          const versionKeys = Object.keys(packument.versions)
            .slice(-10)
            .reverse()
          for (const vKey of versionKeys) {
            const repository = parseGithubRepository(
              packument.versions[vKey]?.repository,
            )
            if (repository) {
              candidates.push(repository)
              break
            }
          }
        }

        const repository = candidates.find((c): c is string => Boolean(c))
        return repository ? canonicalGithubRepository(repository) : null
      } catch {
        return null
      }
    },
  )
}
