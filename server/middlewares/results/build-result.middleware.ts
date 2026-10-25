import type { Middleware } from 'koa'

import now from 'performance-now'

import type {
  CacheKey,
  PackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

import firebaseUtils from '../../../utils/firebase.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import { packageAnalysisGateway } from '../../analysis'
import { BUILD_DURATION_HEADER } from '../../clients/build-service.client'
import logger from '../../infrastructure/logger.service'
import { getBuildCacheMaxAge } from '../../services/build-cache-policy'
import type { PackageBuildResult } from '@bundlephobia/service-contracts/package'

interface BuildCache {
  setPackageSize(key: CacheKey, result: PackageCacheResult): Promise<void>
}

export function createBuildMiddleware(cache: BuildCache): Middleware {
  return async ctx => {
    const priority = getRequestPriority(ctx)

    const { scoped, name, version, description, repository, packageString } =
      ctx.state.resolved

    const { force, record, package: packageQuery } = ctx.query

    const buildStart = now()
    const abortController = new AbortController()

    const onAborted = () => {
      if (ctx.res.writableEnded) return

      logger.info(
        'BUILD_ABORTED',
        {
          requestId: ctx.state.id,
          packageString,
          ...ctx.state.analysis,
        },
        `BUILD_ABORTED: client closed connection for package ${packageString}`,
      )
      abortController.abort()
    }

    ctx.res.on('close', onAborted)

    let result: PackageBuildResult

    ctx.state.analysis.buildRequested = true

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

    ctx.cacheControl = { maxAge: getBuildCacheMaxAge(force, packageQuery) }

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
        ...ctx.state.analysis,
        time,
      },
      `BUILD: ${packageString} built in ${time.toFixed()}s and is ${
        result.size
      } bytes`,
    )

    if (record === 'true') {
      firebaseUtils.setRecentSearch(name, { name, version })
    }

    if (force === 'true') {
      void cache.setPackageSize({ name, version }, body)
    }
  }
}
