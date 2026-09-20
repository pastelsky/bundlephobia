import invariant from 'ts-invariant'
import type { Middleware } from 'koa'

import { parsePackageString } from '../../utils/common.utils'
import config from '../config'
import logger from '../infrastructure/logger.service'
import { fetchPackageHistory } from '../services/package-history.service'

function getQueryValue(
  value: string | string[] | undefined,
  joinArrays = false,
): string | undefined {
  if (Array.isArray(value)) {
    return joinArrays ? value.join('/') : undefined
  }

  return value
}

function getPackageHistoryLimit(value: string | string[] | undefined): number {
  const requestedLimit = Number(getQueryValue(value))

  return Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 40
}

function getPackageHistoryDateError(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  for (const date of [from, to]) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'from and to must be YYYY-MM-DD dates'
    }
  }

  if (from && to && from > to) {
    return 'from must not be after to'
  }

  return undefined
}

export function createPackageHistoryController(): Middleware {
  return async ctx => {
    const packageString = getQueryValue(ctx.query.package, true)

    invariant(packageString, 'package parameter is required')
    const { name } = parsePackageString(packageString)
    const from = getQueryValue(ctx.query.from)
    const to = getQueryValue(ctx.query.to)
    const limit = getPackageHistoryLimit(ctx.query.limit)
    const dateError = getPackageHistoryDateError(from, to)

    if (dateError) {
      ctx.throw(400, dateError)
    }

    try {
      ctx.cacheControl = {
        maxAge: config.CACHE.PACKAGE_HISTORY_API,
      }
      ctx.body = await fetchPackageHistory(name, { from, to, limit })
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : 'Error'
      logger.error(
        'HISTORY',
        error,
        'HISTORY FAILED: for package' + ctx.query.package,
      )
      ctx.status = 422
      ctx.body = { type: errorName, message }
    }
  }
}
