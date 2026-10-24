import { Counter, Registry } from 'prom-client'
import type { AnalysisOperation } from '../analysis/contracts'

export const applicationMetrics = new Registry()

const cacheResponses = new Counter({
  name: 'bundlephobia_analysis_responses_total',
  help: 'Successful origin analysis responses, served from cache or computed.',
  labelNames: ['operation', 'cache'],
  registers: [applicationMetrics],
})

// Count at the shared origin cache decision, including SSR's internal API call.
// Do not label packages/clients or count peeks, rejected requests, and failures.
export function recordCacheResponse(
  operation: AnalysisOperation,
  cache: 'hit' | 'miss',
) {
  cacheResponses.inc({ operation, cache })
}

for (const operation of ['package-analysis', 'package-export-sizes']) {
  for (const cache of ['hit', 'miss'])
    cacheResponses.inc({ operation, cache }, 0)
}
