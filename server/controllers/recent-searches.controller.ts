import type { Middleware } from 'koa'

import config from '../config'
import logger from '../infrastructure/logger.service'
import firebaseUtils from '../../utils/firebase.utils'

export function createRecentSearchesController(): Middleware {
  return async ctx => {
    try {
      ctx.body = await firebaseUtils.getRecentSearches(Number(ctx.query.limit))
      ctx.cacheControl = {
        maxAge: config.CACHE.RECENTS_API,
      }
    } catch (error) {
      ctx.cacheControl = { noStore: true }
      console.error('in /api/recent', error)
      const message = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : 'Error'
      logger.error('RECENT', error, 'RECENT FAILED: failed')
      ctx.status = 422
      ctx.body = { type: errorName, message }
    }
  }
}
