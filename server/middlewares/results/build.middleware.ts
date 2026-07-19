import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import firebaseUtils from '../../../utils/firebase.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import type { PackageBuildResult } from '../../types'
import config from '../../config'
import logger from '../../Logger'
import { packageSizeService } from '../../services/packageSize.service'

const buildMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { record } = ctx.query
  const { forceBuild } = ctx.state.packageRequestPolicy

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
    body = await packageSizeService.buildPackageSize(
      ctx.state.resolved,
      priority,
      abortController.signal
    )
  } finally {
    ctx.req.off('close', onAborted)
  }
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge: forceBuild
      ? 0
      : semver.valid(ctx.state.requestedPackage.version ?? '')
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
