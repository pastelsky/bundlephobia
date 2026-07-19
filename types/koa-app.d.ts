import 'koa'

import type {
  PackageBuildResult,
  PackageRequest,
  ResolvedPackage,
} from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
    packageRequest: PackageRequest
    resolvedPackage?: ResolvedPackage
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
