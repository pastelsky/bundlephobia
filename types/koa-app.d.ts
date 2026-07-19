import 'koa'

import type {
  FailureCacheEntry,
  PackageBuildResult,
  PackageRequest,
  PackageSizeCacheResult,
  ResolvedPackage,
} from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
    packageRequest: PackageRequest
    resolvedPackage?: ResolvedPackage
    packageSizeCache?: PackageSizeCacheResult
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
