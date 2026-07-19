import type { PackageBuildInfo } from '../../types/package-domain'
import { getCachedPackageAnalysis } from './cachedPackageAnalysis'

export type CuratedPackageFacts = {
  name: string
  version: string
  description: string
  repository: string
  result: PackageBuildInfo | null
}

export async function getCuratedPackageFactsBatch(
  packageNames: string[]
): Promise<CuratedPackageFacts[]> {
  return Promise.all(
    packageNames.map(async name => {
      try {
        const result = await getCachedPackageAnalysis(name)
        return {
          name: result?.name ?? name,
          version: result?.version ?? '',
          description: result?.description ?? '',
          repository: result?.repository ?? '',
          result,
        }
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
