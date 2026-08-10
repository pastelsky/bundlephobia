import type { Middleware } from 'koa'
import now from 'performance-now'

import {
  createJavaScriptPackageReference,
  parseJavaScriptPackageSpecifier,
} from '../../../languages/javascript'
import { packageAnalysisGateway } from '../../analysis'
import type { AnalysisOperation } from '../../analysis/contracts'
import { debug, logger } from '../../init'

export function createResolvePackageMiddleware(
  operation: AnalysisOperation,
): Middleware {
  return async (ctx, next) => {
    ctx.state.analysis = { language: 'javascript', operation }
    const packageQuery = ctx.query.package
    const packageString =
      typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

    if (!packageString) {
      ctx.throw(400, 'package query parameter is required')
      return
    }

    const resolvedPackageString = packageString
    const parsedPackage = parseJavaScriptPackageSpecifier(resolvedPackageString)

    ctx.state.resolved = {
      language: 'javascript',
      specifier: resolvedPackageString,
      ...parsedPackage,
      version: parsedPackage.version ?? 'latest',
      displayName: parsedPackage.name,
      canonicalSpecifier: `${parsedPackage.name}@${parsedPackage.version}`,
      description: '',
      repository: '',
      packageString: `${parsedPackage.name}@${parsedPackage.version}`,
    }

    const resolveStart = now()
    const resolvedPackage = await packageAnalysisGateway.resolvePackage(
      createJavaScriptPackageReference(resolvedPackageString),
    )
    const resolveEnd = now()

    const result = {
      ...resolvedPackage,
      scoped: parsedPackage.scoped,
      packageString: resolvedPackage.canonicalSpecifier,
    }
    ctx.state.resolved = result

    debug('resolved to %s@%s', result.name, result.version)
    const time = resolveEnd - resolveStart
    logger.info(
      'RESOLVE_PACKAGE',
      { ...ctx.state.analysis, ...result, time, requestId: ctx.state.id },
      `RESOLVED: ${result.packageString} in ${time.toFixed(0)}ms`,
    )

    await next()
  }
}

export default createResolvePackageMiddleware('package-analysis')
