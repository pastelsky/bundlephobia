import Koa from 'koa'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import type { ResolvedPackageState } from '../server/types'
import logger from '../server/infrastructure/logger.service'
import buildCircuitAdmission from '../server/middlewares/build-circuit-admission.middleware'
import { applicationMetrics } from '../server/infrastructure/application-metrics'
import { buildCircuitBreaker } from '../server/infrastructure/build-circuit-breaker'
import { createAnalysisContextMiddleware } from '../server/middlewares/analysis-context.middleware'
import cachedResponse from '../server/middlewares/results/cached-response.middleware'
import buildMissRateLimit from '../server/middlewares/build-miss-rate-limit.middleware'
import { createResolvePackageMiddleware } from '../server/middlewares/results/resolve-package.middleware'
import { packageAnalysisGateway } from '../server/analysis'

function context(hit: boolean, force = false) {
  const request = new IncomingMessage(new Socket())
  request.method = 'GET'
  request.url = '/api/size?package=test@1.0.0'
  const ctx = new Koa().createContext(request, new ServerResponse(request))

  if (force) ctx.query.force = 'true'
  // SAFETY: only the resolved fields consumed by cache middleware are needed here.
  ctx.state.resolved = {
    name: 'test',
    version: '1.0.0',
    packageString: 'test@1.0.0',
    language: 'javascript',
  } as ResolvedPackageState
  ctx.cashed = jest.fn(async () => {
    if (hit) ctx.status = 200

    return hit
  })

  return ctx
}

beforeEach(() => {
  jest.spyOn(buildCircuitBreaker, 'check').mockResolvedValue(true)
  applicationMetrics.resetMetrics()
  jest.spyOn(logger, 'info').mockImplementation(() => {})
  jest.spyOn(packageAnalysisGateway, 'resolvePackage')
})

afterEach(() => jest.restoreAllMocks())

it.each([false, true])(
  'serves an existing cache result during emergency mode, force=%s',
  async force => {
    const ctx = context(true, force)
    const build = jest.fn()
    await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
      await cachedResponse(ctx, async () => {
        await buildCircuitAdmission(ctx, async () => {
          await buildMissRateLimit()(ctx, build)
        })
      })
    })
    expect(ctx.status).toBe(200)
    expect(ctx.cashed).toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
    expect(ctx.cacheControl).toEqual({ noStore: true })
    expect(await applicationMetrics.metrics()).toContain(
      'bundlephobia_build_circuit_breaker_responses_total{result="cache_served"} 1',
    )
  },
)

it('rejects cold misses without building and records rejection rather than cache success', async () => {
  const ctx = context(false)
  const build = jest.fn()
  await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
    await cachedResponse(ctx, async () => {
      await buildCircuitAdmission(ctx, async () => {
        await buildMissRateLimit()(ctx, build)
      })
    })
  })
  expect(ctx.status).toBe(503)
  expect(build).not.toHaveBeenCalled()
  expect(ctx.response.get('Retry-After')).toBe('60')
  const metrics = await applicationMetrics.metrics()
  expect(metrics).toContain(
    'bundlephobia_build_circuit_breaker_responses_total{result="rejected"} 1',
  )
  expect(metrics).not.toContain(
    'bundlephobia_build_circuit_breaker_responses_total{result="cache_served"} 1',
  )
})

it('keeps ordinary cold-build admission when the breaker is closed', async () => {
  jest.spyOn(buildCircuitBreaker, 'check').mockResolvedValue(false)
  const ctx = context(false)
  const build = jest.fn()
  await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
    await cachedResponse(ctx, async () => {
      await buildCircuitAdmission(ctx, async () => {
        await buildMissRateLimit()(ctx, build)
      })
    })
  })
  expect(build).toHaveBeenCalledTimes(1)
  expect(ctx.state.analysis.circuitBreakerActive).toBe(false)
})

it('serves a previously built latest release without registry resolution, including forced refresh', async () => {
  const ctx = context(false, true)
  ctx.query.package = 'test'

  const cache = {
    getLatestBuiltPackageSize: jest.fn().mockResolvedValue({
      status: 'hit',
      value: { name: 'test', version: '1.0.0' },
    }),
  }

  const build = jest.fn()
  await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
    await createResolvePackageMiddleware('package-analysis', cache)(ctx, build)
  })
  expect(ctx.status).toBe(200)
  expect(ctx.state.analysis.circuitBreakerActive).toBe(true)
  expect(packageAnalysisGateway.resolvePackage).not.toHaveBeenCalled()
  expect(build).not.toHaveBeenCalled()
})

it('does not substitute an old release for an explicit version', async () => {
  const ctx = context(false)
  const cache = { getLatestBuiltPackageSize: jest.fn() }
  jest
    .spyOn(packageAnalysisGateway, 'resolvePackage')
    .mockRejectedValue(new Error('registry offline'))
  await expect(
    createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
      await createResolvePackageMiddleware('package-analysis', cache)(
        ctx,
        jest.fn(),
      )
    }),
  ).rejects.toThrow('registry offline')
  expect(cache.getLatestBuiltPackageSize).not.toHaveBeenCalled()
})

it('does not count a cache outage as a successfully served cached result', async () => {
  const ctx = context(false)
  ctx.query.package = 'test'

  const cache = {
    getLatestBuiltPackageSize: jest
      .fn()
      .mockResolvedValue({ status: 'unavailable' }),
  }

  const build = jest.fn()
  await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
    await createResolvePackageMiddleware('package-analysis', cache)(ctx, build)
  })
  expect(ctx.status).toBe(503)
  expect(build).not.toHaveBeenCalled()
  expect(await applicationMetrics.metrics()).toContain(
    'bundlephobia_build_circuit_breaker_responses_total{result="other"} 1',
  )
})

it('keeps force refresh semantics when the breaker is closed', async () => {
  jest.spyOn(buildCircuitBreaker, 'check').mockResolvedValue(false)
  const ctx = context(true, true)
  const build = jest.fn()
  await createAnalysisContextMiddleware('package-analysis')(ctx, async () => {
    await cachedResponse(ctx, async () => {
      await buildCircuitAdmission(ctx, build)
    })
  })
  expect(ctx.cashed).not.toHaveBeenCalled()
  expect(build).toHaveBeenCalledTimes(1)
})
