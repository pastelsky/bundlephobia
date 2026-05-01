import type { Middleware } from 'koa'
import now from 'performance-now'
import semver from 'semver'

import Cache from '../../../utils/cache.utils'
import firebaseUtils from '../../../utils/firebase.utils'
import { parsePackageString } from '../../../utils/common.utils'
import { getRequestPriority } from '../../../utils/server.utils'
import BuildService from '../../api/BuildService'
import config from '../../config'
import logger from '../../Logger'
import type { PackageBuildResult } from '../../types'

const cache = new Cache()
const buildService = new BuildService()

const buildMiddleware: Middleware = async ctx => {
  const priority = getRequestPriority(ctx)
  const { scoped, name, version, description, repository, packageString } =
    ctx.state.resolved
  const { force, record, package: packageQuery } = ctx.query
  const requestedPackage =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  const buildStart = now()
  const result = await buildService.getPackageBuildStats<PackageBuildResult>(
    packageString,
    priority
  )
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
    void cache.setPackageSize({ name, version }, body)
  }
}

export default buildMiddleware
