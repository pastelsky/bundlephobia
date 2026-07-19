import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import firebaseUtils from '../../../utils/firebase.utils'
import { parsePackageString } from '../../../utils/common.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import type { PackageBuildResult } from '../../types'
import config from '../../config'
import logger from '../../Logger'
import { packageAnalysisService } from '../../services/packageAnalysis.service'

const buildMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { name, version, packageString } = ctx.state.resolved
  const { force, record, package: packageQuery } = ctx.query
  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

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
    body = await packageAnalysisService.build(
      ctx.state.resolved,
      priority,
      abortController.signal
    )
  } finally {
    ctx.req.off('close', onAborted)
  }
  const buildEnd = now()

  ctx.cacheControl = {
    maxAge:
      force != null
        ? 0
        : requestedPackage &&
          semver.valid(parsePackageString(requestedPackage).version)
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
