import gitURLParse from 'git-url-parse'
import semver from 'semver'

import type { PackageBuildInfo } from '../../types/package-domain'
import Cache from '../../utils/cache.utils'
import { parsePackageString } from '../../utils/common.utils'
import { resolvePackage } from '../../utils/server.utils'

const cache = new Cache()

export type PackageFacts = {
  name: string
  version: string
  description: string
  repository: string
  result: PackageBuildInfo | null
}

function toRepositoryUrl(repository: string | { url?: string } | undefined) {
  if (!repository) return ''

  try {
    const rawRepository =
      typeof repository === 'string' ? repository : repository.url ?? ''
    return gitURLParse(rawRepository).toString('https')
  } catch {
    return ''
  }
}

/**
 * Resolve lightweight npm metadata, then read an existing analysis from the
 * cache service. This function deliberately never calls the build service.
 */
export async function getPackageFacts(
  packageString: string
): Promise<PackageFacts> {
  const parsedPackage = parsePackageString(packageString)

  // Versioned package URLs can be answered entirely from the analysis cache.
  // This both saves an npm registry round trip and keeps SSR available during
  // a registry incident.
  if (parsedPackage.version && semver.valid(parsedPackage.version)) {
    const exactResult = await cache.getPackageSize<PackageBuildInfo>({
      name: parsedPackage.name,
      version: parsedPackage.version,
    })

    if (exactResult) {
      return {
        name: exactResult.name,
        version: exactResult.version,
        description: exactResult.description,
        repository: exactResult.repository,
        result: exactResult,
      }
    }
  }

  const manifest = await resolvePackage(packageString)
  const result =
    (await cache.getPackageSize<PackageBuildInfo>({
      name: manifest.name,
      version: manifest.version,
    })) ?? null

  return {
    name: manifest.name,
    version: manifest.version,
    description: result?.description ?? manifest.description ?? '',
    repository:
      result?.repository ?? toRepositoryUrl(manifest.repository) ?? '',
    result,
  }
}

export async function getPackageFactsBatch(
  packageNames: string[]
): Promise<PackageFacts[]> {
  return Promise.all(
    packageNames.map(async name => {
      try {
        return await getPackageFacts(name)
      } catch {
        return {
          name,
          version: '',
          description: '',
          repository: '',
          result: null,
        }
      }
    })
  )
}
