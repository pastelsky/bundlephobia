import type { Context } from 'koa'
import now from 'performance-now'

import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageExportsResult,
  PackageIdentity,
  PackageMetadata,
} from '../../types/package-domain'
import { buildService } from '../api/BuildService'
import { logger } from '../init'
import type { ResolvedPackage } from '../types'
import { runCancellableBuild } from './cancellableBuild'
import {
  exportSizesCache,
  packageSizeCache,
  type ExportSizesResult,
  type PackageResultCache,
} from './packageResultCache'

/**
 * One record per package API. The pipeline reads these declaratively, so a new
 * endpoint is a new entry here — not a new chain of middleware. Every endpoint:
 * - optionally has a `cache` its results are read from and written to,
 * - knows how to `build` its result for a resolved package,
 * - says whether cache misses are rate limited, and
 * - says whether a successful lookup records a recent search.
 */
export interface PackageEndpoint<TResult extends PackageIdentity> {
  cache: PackageResultCache<TResult> | null
  build(
    ctx: Context,
    resolvedPackage: ResolvedPackage,
    priority: number
  ): Promise<TResult>
  rateLimitMisses: boolean
  recordRecentSearch: boolean
}

// ── size ─────────────────────────────────────────────────────

/** Build-worker stats for a package, before npm metadata is attached. */
export type PackageSizeStats = Omit<
  PackageBuildResult,
  keyof PackageMetadata | 'scoped'
>

/** Attaches identity + npm metadata to raw build stats. Pure and testable. */
export function composePackageSize(
  resolvedPackage: ResolvedPackage,
  stats: PackageSizeStats
): PackageBuildResult {
  return {
    ...stats,
    scoped: resolvedPackage.scoped,
    name: resolvedPackage.name,
    version: resolvedPackage.version,
    description: resolvedPackage.description,
    repository: resolvedPackage.repository,
  }
}

async function buildPackageSize(
  ctx: Context,
  resolvedPackage: ResolvedPackage,
  priority: number
): Promise<PackageBuildInfo> {
  const { packageString } = resolvedPackage
  const abortController = new AbortController()
  const onClientDisconnect = () => {
    logger.info(
      'BUILD_ABORTED',
      { requestId: ctx.state.id, packageString },
      `BUILD_ABORTED: client closed connection for package ${packageString}`
    )
    abortController.abort()
  }
  ctx.req.on('close', onClientDisconnect)

  const buildStart = now()
  let stats: PackageSizeStats
  try {
    stats = await runCancellableBuild({
      run: () =>
        buildService.getPackageBuildStats<PackageSizeStats>(
          packageString,
          priority
        ),
      cancel: () => buildService.cancelPackageBuildStats(packageString),
      signal: abortController.signal,
    })
  } finally {
    ctx.req.off('close', onClientDisconnect)
  }
  const time = now() - buildStart

  const result = composePackageSize(resolvedPackage, stats)
  logger.info(
    'BUILD',
    { result, requestId: ctx.state.id, packageString, time },
    `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
      result.size
    } bytes`
  )
  return result
}

// ── exports ──────────────────────────────────────────────────

export type PackageExportsBody = PackageIdentity & {
  exports: PackageExportsResult
}

async function buildPackageExports(
  ctx: Context,
  resolvedPackage: ResolvedPackage,
  priority: number
): Promise<PackageExportsBody> {
  const { name, version, packageString } = resolvedPackage
  const buildStart = now()
  const exports = await buildService.getPackageExports<PackageExportsResult>(
    packageString,
    priority
  )
  const time = now() - buildStart

  logger.info(
    'BUILD_EXPORTS',
    { result: exports, requestId: ctx.state.id, packageString, time },
    `BUILD EXPORTS: ${packageString} built in ${time.toFixed()}s`
  )
  return { name, version, exports }
}

// ── export sizes ─────────────────────────────────────────────

async function buildPackageExportSizes(
  ctx: Context,
  resolvedPackage: ResolvedPackage,
  priority: number
): Promise<ExportSizesResult> {
  const { name, version, packageString } = resolvedPackage
  const buildStart = now()
  const result = await buildService.getPackageExportSizes<
    Omit<ExportSizesResult, keyof PackageIdentity>
  >(packageString, priority)
  const time = now() - buildStart

  logger.info(
    'BUILD_EXPORTS_SIZES',
    { result, requestId: ctx.state.id, packageString, time },
    `BUILD EXPORTS SIZES: ${packageString} built in ${time.toFixed()}s`
  )
  return { name, version, ...result }
}

// ── endpoints ────────────────────────────────────────────────

export const sizeEndpoint: PackageEndpoint<PackageBuildInfo> = {
  cache: packageSizeCache,
  build: buildPackageSize,
  rateLimitMisses: true,
  recordRecentSearch: true,
}

export const exportsEndpoint: PackageEndpoint<PackageExportsBody> = {
  cache: null,
  build: buildPackageExports,
  rateLimitMisses: false,
  recordRecentSearch: false,
}

export const exportSizesEndpoint: PackageEndpoint<ExportSizesResult> = {
  cache: exportSizesCache,
  build: buildPackageExportSizes,
  rateLimitMisses: true,
  recordRecentSearch: false,
}
