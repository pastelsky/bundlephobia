import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Counter, Registry } from 'prom-client'
import type { PackageAnalysisRequestState } from '../types'

export const applicationMetrics = new Registry()

type ClientType = 'bot' | 'non_bot' | 'unknown'

// Read the same finite family vocabulary as HAProxy once at startup. No user
// agent parsing or filesystem work happens while recording a request.
const clientFamilies = new Set(['other', 'other_bot', 'unknown'])

for (const filename of ['automation-groups.map', 'client-families.map']) {
  const contents = readFileSync(
    resolve(__dirname, '../../operations/haproxy', filename),
    'utf8',
  )

  for (const line of contents.split('\n')) {
    const [pattern, family] = line.trim().split(/\s+/)

    if (pattern && !pattern.startsWith('#') && family)
      clientFamilies.add(family)
  }
}

export function getAnalysisClientFamily(value: string): string {
  return clientFamilies.has(value) ? value : 'unknown'
}

export function getAnalysisClientType(value: string): ClientType {
  return value === 'bot' || value === 'non_bot' ? value : 'unknown'
}

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
  clientType: ClientType
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
    client_family: getAnalysisClientFamily(request.clientFamily),
  })
}

// Use the existing proxy classification. Raw user agents, packages and IPs stay
// in logs: they would create unbounded metric series and grow retained storage.
export function recordAnalysisRequest(request: AnalysisRequest) {
  if (request.probe) return

  analysisRequests.inc({
    operation: request.operation,
    cache: request.cache ?? 'unknown',
    client_type: request.clientType,
    client_family: getAnalysisClientFamily(request.clientFamily),
    build_requested: String(request.buildRequested ?? false),
    outcome: requestOutcome(request.status),
  })
  recordSuccessfulCacheResponse(request)
}

for (const operation of ['package-analysis', 'package-export-sizes']) {
  for (const cache of ['hit', 'miss']) {
    for (const client_type of ['bot', 'non_bot', 'unknown'])
      cacheResponses.inc(
        { operation, cache, client_type, client_family: 'unknown' },
        0,
      )
  }
}
