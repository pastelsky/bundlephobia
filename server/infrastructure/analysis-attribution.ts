import type { Context } from 'koa'

import logger from './logger.service'

export function analysisAttribution(ctx: Context) {
  return {
    requestId: ctx.state.id,
    userAgent: ctx.get('User-Agent').slice(0, 512),
    clientIp: ctx.get('CF-Connecting-IP') || ctx.ip,
    source:
      ctx.get('X-Bundlephobia-Prefer-Cached') === 'true'
        ? 'crawler-page'
        : 'api',
    language: ctx.state.analysis.language,
    operation: ctx.state.analysis.operation,
    packageString: ctx.state.resolved?.packageString,
    cache: ctx.state.analysis.cache ?? 'unknown',
    probe: Boolean(ctx.query.peep || ctx.query.peek),
    force: ctx.query.force === 'true',
    buildRequested: ctx.state.analysis.buildRequested ?? false,
  }
}

export function recordAnalysisBuildRequest(ctx: Context) {
  ctx.state.analysis.buildRequested = true

  if (!ctx.state.analysis.cache) ctx.state.analysis.cache = 'bypass'

  const attribution = analysisAttribution(ctx)
  // The console formatter drops metadata. Keep a safe, single-line payload in
  // the message, before queueing, so disconnects retain their request identity.
  logger.info(
    'BUILD_REQUESTED',
    attribution,
    `BUILD REQUESTED: ${JSON.stringify(attribution)}`,
  )
}
