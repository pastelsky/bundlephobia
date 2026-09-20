import 'koa'

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
    buildResult?: PackageBuildResult
  }

  interface ExtendableContext {
    cacheControl?: {
      maxAge?: number
      noCache?: boolean
    }
    cashed(): Promise<boolean>
  }
}

export {}
