import React from 'react'

import type { PackageBuildBase } from './package-domain'

/**
 * Props shape used by UI components that display package stats.
 * Derived from `PackageBuildBase` so the field list stays in sync
 * with the domain type; `isTreeShakeable` is a computed UI concept
 * (true when hasJSModule || hasJSNext || isModuleType).
 */
export type PackageInfo = Pick<
  PackageBuildBase,
  'name' | 'description' | 'repository' | 'dependencyCount' | 'hasSideEffects'
> & {
  isTreeShakeable: boolean
}

export type WithClassName = Pick<React.HTMLAttributes<HTMLElement>, 'className'>
