import { Counter, Registry } from 'prom-client'
import type { PackageAnalysisRequestState } from '../types'

export const applicationMetrics = new Registry()

const cacheResponses = new Counter({
  name: 'bundlephobia_analysis_responses_total',
  help: 'Successful origin analysis responses, served from cache or computed.',
  labelNames: ['operation', 'cache', 'client_type', 'client_family'],
  registers: [applicationMetrics],
})

const analysisRequests = new Counter({
  name: 'bundlephobia_analysis_requests_total',
  help: 'Origin analysis requests reaching the analysis route, excluding probes; build_requested includes queued and coalesced requests.',
  labelNames: [
    'operation',
    'cache',
    'client_type',
    'client_family',
    'build_requested',
    'outcome',
  ],
  registers: [applicationMetrics],
})

interface AnalysisRequest extends PackageAnalysisRequestState {
  clientType: string
  clientFamily: string
  status: number
  probe: boolean
}

function requestOutcome(status: number) {
  if (status === 429) return 'rate_limited'

  if (status === 408) return 'cancelled'

  return status >= 200 && status < 300 ? 'success' : 'error'
}

function recordSuccessfulCacheResponse(request: AnalysisRequest) {
  if (request.status !== 200 || request.operation === 'package-exports') return

  const { cache } = request

  if (cache !== 'hit' && cache !== 'miss' && cache !== 'bypass') return

  cacheResponses.inc({
    operation: request.operation,
    cache: cache === 'hit' ? 'hit' : 'miss',
    client_type: request.clientType,
    client_family: request.clientFamily,
  })
}

// HAProxy overwrites classification headers; forward its bounded labels.
// Raw user agents, packages and IPs stay in logs to avoid unbounded series.
export function recordAnalysisRequest(request: AnalysisRequest) {
  if (request.probe) return

  analysisRequests.inc({
    operation: request.operation,
    cache: request.cache ?? 'unknown',
    client_type: request.clientType,
    client_family: request.clientFamily,
    build_requested: String(request.buildRequested ?? false),
    outcome: requestOutcome(request.status),
  })
  recordSuccessfulCacheResponse(request)
}

for (const operation of ['package-analysis', 'package-export-sizes']) {
  for (const cache of ['hit', 'miss'])
    cacheResponses.inc(
      { operation, cache, client_type: 'unknown', client_family: 'unknown' },
      0,
    )
}
