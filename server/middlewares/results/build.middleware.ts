import type { Middleware } from 'koa'
import now from 'performance-now'

import firebaseUtils from '../../../utils/firebase.utils'
import { PackageCacheMode } from '../../../utils/packageApi.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import { buildService } from '../../api/BuildService'
import type { PackageBuildResult } from '../../types'
import config from '../../config'
import logger from '../../Logger'
import {
  getExactRequestedVersion,
  requireResolvedPackage,
} from '../../services/packageResolution.service'
import {
  packageSizeService,
  type PackageSizeBuild,
  type PackageSizeBuilder,
} from '../../services/packageSize.service'

const packageSizeBuilder: PackageSizeBuilder = {
  build: (packageString, priority) =>
    buildService.getPackageBuildStats<PackageSizeBuild>(
      packageString,
      priority
    ),
  cancel: packageString => buildService.cancelPackageBuildStats(packageString),
}

// Builds a package only after resolution and all cache stages miss.
// Publishes and caches the complete size result for the HTTP response.
const buildMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const resolvedPackage = requireResolvedPackage(ctx.state.resolvedPackage)
  const { name, version, packageString } = resolvedPackage
  const { record } = ctx.query
  const { cacheMode } = ctx.state.packageRequest

  const buildStart = now()
  const abortController = new AbortController()
  const onAborted = () => {
    logger.info(
      'BUILD_ABORTED',
      {
        requestId: ctx.state.id,
        packageString,
      },
      `BUILD_ABORTED: client closed connection for package ${packageString}`
    )
    abortController.abort()
  }

  ctx.req.on('close', onAborted)

  let body: PackageBuildResult
  try {
    body = await packageSizeService.buildPackageSize(resolvedPackage, {
      builder: packageSizeBuilder,
      priority,
      signal: abortController.signal,
    })
  } finally {
    ctx.req.off('close', onAborted)
  }
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge:
      cacheMode === PackageCacheMode.ForceRebuild
        ? 0
        : getExactRequestedVersion(ctx.state.packageRequest) !== null
        ? config.CACHE.SIZE_API_HAS_VERSION
        : config.CACHE.SIZE_API_DEFAULT,
  }

  ctx.body = body
  ctx.state.buildResult = body
  const time = buildEnd - buildStart

  logger.info(
    'BUILD',
    {
      result: body,
      requestId: ctx.state.id,
      packageString,
      time,
    },
    `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
      body.size
    } bytes`
  )

  if (record === 'true') {
    firebaseUtils.setRecentSearch(name, { name, version })
  }
}

export default buildMiddleware
