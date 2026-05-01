import gitURLParse from 'git-url-parse'
import type { Middleware } from 'koa'
import now from 'performance-now'

import { parsePackageString } from '../../../utils/common.utils'
import { resolvePackage } from '../../../utils/server.utils'
import { debug, logger } from '../../init'
import type { ResolvedPackageState } from '../../types'

function toRepositoryUrl(repository: string | { url?: string } | undefined) {
  if (!repository) {
    return ''
  }

  try {
    const rawRepository =
      typeof repository === 'string' ? repository : repository.url ?? ''
    return gitURLParse(rawRepository).toString('https')
  } catch {
    console.error('failed to parse repository url', repository)
    return ''
  }
}

const resolvePackageMiddleware: Middleware = async (ctx, next) => {
  const packageQuery = ctx.query.package
  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')
    return
  }

  const resolvedPackageString = packageString
  const parsedPackage = parsePackageString(resolvedPackageString)

  ctx.state.resolved = {
    ...parsedPackage,
    version: parsedPackage.version ?? 'latest',
    description: '',
    repository: '',
    packageString: `${parsedPackage.name}@${parsedPackage.version}`,
  }

  const resolveStart = now()
  const resolvedPackage = await resolvePackage(resolvedPackageString)
  const resolveEnd = now()

  const truncatedDescription = resolvedPackage.description
    ? resolvedPackage.description.length > 300
      ? `${resolvedPackage.description.substring(0, 300)}…`
      : resolvedPackage.description
    : ''

  const result: ResolvedPackageState = {
    name: resolvedPackage.name,
    version: resolvedPackage.version,
    scoped: parsedPackage.scoped,
    packageString: `${resolvedPackage.name}@${resolvedPackage.version}`,
    description: truncatedDescription,
    repository: toRepositoryUrl(resolvedPackage.repository),
  }

  ctx.state.resolved = result

  debug('resolved to %s@%s', result.name, result.version)
  const time = resolveEnd - resolveStart
  logger.info(
    'RESOLVE_PACKAGE',
    { ...result, time, requestId: ctx.state.id },
    `RESOLVED: ${result.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default resolvePackageMiddleware
