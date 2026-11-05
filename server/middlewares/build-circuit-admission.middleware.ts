import type { Middleware } from 'koa'
import { buildCircuitBreaker } from '../infrastructure/build-circuit-breaker'

// Registered after cache lookup; already admitted work retains its cancellation.
const buildCircuitAdmission: Middleware = async (ctx, next) => {
  if (ctx.method === 'OPTIONS' || !(await buildCircuitBreaker.check())) {
    await next()

    return
  }

  ctx.state.analysis.circuitBreakerActive = true
  ctx.state.analysis.circuitBreakerRejected = true
  ctx.cacheControl = { noStore: true }
  ctx.set('Retry-After', '60')
  ctx.status = 503
  ctx.body = {
    error: {
      code: 'BuildCircuitOpen',
      message:
        'New package analysis is temporarily paused. Cached results remain available.',
    },
  }
}

export default buildCircuitAdmission
