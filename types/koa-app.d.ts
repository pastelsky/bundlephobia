import 'koa'

import type { NpmPackageManifest } from '../server/clients/npm-registry.client'
import type {
  FailureCacheEntry,
  PackageAnalysisRequestState,
  PackageBuildResult,
  ResolvedPackageState,
} from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
    analysis: PackageAnalysisRequestState
    resolved: ResolvedPackageState
    packageManifest?: NpmPackageManifest
    buildResult?: PackageBuildResult
  }

  interface ExtendableContext {
    cacheControl?: {
      maxAge?: number
      noCache?: boolean
      private?: boolean
      noStore?: boolean
    }
    cashed(): Promise<boolean>
  }
}

export {}
