import 'koa'

import type {
  FailureCacheEntry,
  PackageBuildResult,
  ResolvedPackageState,
} from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
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
