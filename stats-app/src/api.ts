import { z } from 'zod'

const sample = z.tuple([z.number(), z.string()])

const labels = z.record(z.string(), z.string())

const rangeResponse = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.literal('matrix'),
    result: z.array(z.object({ metric: labels, values: z.array(sample) })),
  }),
})

const instantResponse = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.literal('vector'),
    result: z.array(z.object({ metric: labels, value: sample })),
  }),
})

export interface TimeRange {
  label: string
  seconds: number
}

export const TIME_RANGES: TimeRange[] = [
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 21600 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
  { label: '15d', seconds: 1296000 },
]

export interface RangeRequest {
  expression: string
  seconds: number
  end: number
}

async function request(
  endpoint: string,
  params: URLSearchParams,
  signal: AbortSignal,
) {
  const response = await fetch(`/stats/api/v1/${endpoint}?${params}`, {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401)
    throw new Error('Your stats session has expired. Reload to sign in again.')

  if (!response.ok)
    throw new Error(
      'VictoriaMetrics is unavailable. Try refreshing in a moment.',
    )
  const payload: unknown = await response.json()

  return payload
}

export function stepSeconds(seconds: number) {
  // Bound the browser payload to about 240 points per series; never ask for
  // higher resolution than HAProxy's one-minute scrape interval.
  return Math.max(60, Math.ceil(seconds / 240 / 60) * 60)
}

export async function queryRange(query: RangeRequest, signal: AbortSignal) {
  const params = new URLSearchParams({
    query: query.expression,
    start: String(query.end - query.seconds),
    end: String(query.end),
    step: String(stepSeconds(query.seconds)),
  })

  const parsed = rangeResponse.safeParse(
    await request('query_range', params, signal),
  )

  if (!parsed.success)
    throw new Error('VictoriaMetrics returned an unexpected chart response.')

  return parsed.data.data.result
}

export async function queryInstant(expression: string, signal: AbortSignal) {
  const params = new URLSearchParams({ query: expression })

  const parsed = instantResponse.safeParse(
    await request('query', params, signal),
  )

  if (!parsed.success)
    throw new Error('VictoriaMetrics returned an unexpected summary response.')

  return parsed.data.data.result
}

export function finiteValue(value: string) {
  const number = Number(value)

  return Number.isFinite(number) ? number : null
}
