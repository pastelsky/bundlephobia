import type { Middleware } from 'koa'
import now from 'performance-now'

import { parsePackageString } from '../../../utils/common.utils'
import { debug, logger } from '../../init'
import { packageAnalysisService } from '../../services/packageAnalysis.service'

const packageAnalysisLookupMiddleware: Middleware = async (ctx, next) => {
  const packageQuery = ctx.query.package
  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')
    return
  }

  const parsedPackage = parsePackageString(packageString)
  ctx.state.resolved = {
    ...parsedPackage,
    version: parsedPackage.version ?? 'latest',
    description: '',
    repository: '',
    packageString: `${parsedPackage.name}@${parsedPackage.version ?? 'latest'}`,
  }

  const resolveStart = now()
  const analysis = await packageAnalysisService.lookup(
    packageString,
    ctx.query.force != null
  )
  const resolveEnd = now()
  ctx.state.resolved = analysis.resolved
  ctx.state.packageAnalysis = analysis

  debug('resolved to %s', analysis.resolved.packageString)
  const time = resolveEnd - resolveStart
  logger.info(
    'RESOLVE_PACKAGE',
    {
      ...analysis.resolved,
      source: analysis.source,
      time,
      requestId: ctx.state.id,
    },
    `RESOLVED: ${analysis.resolved.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

export default packageAnalysisLookupMiddleware
