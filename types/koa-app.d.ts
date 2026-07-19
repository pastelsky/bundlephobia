import 'koa'

import type { PackageRequest, ResolvedPackage } from '../server/types'

declare module 'koa' {
  interface DefaultState {
    id?: string
    packageRequest: PackageRequest
    resolvedPackage?: ResolvedPackage
  }

  interface ExtendableContext {
    cacheControl?: {
      maxAge?: number
      noCache?: boolean
    }
  }
}

export {}
