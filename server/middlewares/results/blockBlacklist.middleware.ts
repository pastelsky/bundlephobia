import type { Middleware } from 'koa'

import { parsePackageString } from '../../../utils/common.utils'
import config from '../../config'
import CustomError from '../../CustomError'

const blockBlacklistMiddleware: Middleware = async (ctx, next) => {
  const { package: packageQuery, force } = ctx.query
  if (force) {
    await next()
    return
  }

  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')
    return
  }

  const parsedPackage = parsePackageString(packageString)

  if (config.blackList.some(entry => entry.test(parsedPackage.name))) {
    throw new CustomError(
      'BlocklistedPackageError',
      { ...parsedPackage },
      undefined
    )
  }

  const matchedUnsupportedRule = config.unsupported.find(rule =>
    new RegExp(rule.test).test(parsedPackage.name)
  )

  if (matchedUnsupportedRule) {
    throw new CustomError(
      'UnsupportedPackageError',
      { ...parsedPackage },
      { reason: matchedUnsupportedRule.reason }
    )
  }

  await next()
}

export default blockBlacklistMiddleware
