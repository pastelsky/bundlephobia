import 'koa'

import type {
  FailureCacheEntry,
  PackageBuildResult,
  PackageSizeLookup,
  RequestedPackage,
  ResolvedPackageState,
} from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
    requestedPackage: RequestedPackage
    resolved: ResolvedPackageState
    packageSizeLookup?: PackageSizeLookup
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
