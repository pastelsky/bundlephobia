import type { Middleware } from 'koa'
import now from 'performance-now'

import { createJavaScriptPackageReference } from '../../../languages/javascript'
import Cache from '../../../utils/cache.utils'
import firebaseUtils from '../../../utils/firebase.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import { packageAnalysisGateway } from '../../analysis'
import { BUILD_DURATION_HEADER } from '../../api/BuildService'
import config from '../../config'
import logger from '../../Logger'
import type { PackageBuildResult } from '../../types'

const cache = new Cache()
const buildMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { scoped, name, version, description, repository, packageString } =
    ctx.state.resolved
  const { force, record, package: packageQuery } = ctx.query
  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
  const abortController = new AbortController()

  const onAborted = () => {
    if (ctx.res.writableEnded) return

    logger.info(
      'BUILD_ABORTED',
      {
        requestId: ctx.state.id,
        packageString,
        language: ctx.state.analysis.language,
        operation: ctx.state.analysis.operation,
      },
      `BUILD_ABORTED: client closed connection for package ${packageString}`
    )
    abortController.abort()
  }

  ctx.res.on('close', onAborted)

  let result: PackageBuildResult
  try {
    result = await packageAnalysisGateway.analyzePackage(ctx.state.resolved, {
      priority,
      signal: abortController.signal,
      onComplete: durationMs => {
        ctx.set(BUILD_DURATION_HEADER, String(durationMs))
      },
    })
  } finally {
    ctx.res.off('close', onAborted)
  }

  const buildEnd = now()

  ctx.cacheControl = {
    maxAge:
      force != null
        ? 0
        : requestedPackage &&
          packageAnalysisGateway.isExactVersionSpecifier(
            createJavaScriptPackageReference(requestedPackage)
          )
        ? config.CACHE.SIZE_API_HAS_VERSION
        : config.CACHE.SIZE_API_DEFAULT,
  }

  const body: PackageBuildResult = {
    ...result,
    scoped,
    name,
    version,
    description,
    repository,
  }

  ctx.body = body
  ctx.state.buildResult = body
  const time = buildEnd - buildStart

  logger.info(
    'BUILD',
    {
      result,
      requestId: ctx.state.id,
      packageString,
      language: ctx.state.analysis.language,
      operation: ctx.state.analysis.operation,
      time,
    },
    `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
      result.size
    } bytes`
  )

  if (record === 'true') {
    firebaseUtils.setRecentSearch(name, { name, version })
  }

  if (force === 'true') {
    void cache.setPackageSize(
      { language: ctx.state.resolved.language, name, version },
      body
    )
  }
}

export default buildMiddleware
