import {
  queryInstant,
  stepSeconds,
  TIME_RANGES,
} from '../stats-app/src/lib/api'
import { loadPanel, loadSummary } from '../stats-app/src/dashboard/metrics'

import { CHARTS } from '../stats-app/src/dashboard/charts'

const end = Date.parse('2026-10-24T06:00:00Z') / 1000

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(end * 1000)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

function serveMatrix(values: [number, string][]) {
  jest.spyOn(globalThis, 'fetch').mockImplementation(
    jest.fn(async () =>
      Response.json({
        status: 'success',
        data: { resultType: 'matrix', result: [{ metric: {}, values }] },
      }),
    ),
  )
}

describe('history from the VictoriaMetrics API', () => {
  it('preserves real zero values while displaying missing and non-finite samples as gaps', async () => {
    serveMatrix([
      [end - 1800, '0'],
      [end - 1740, 'NaN'],
      [end, '12.5'],
    ])

    const chart = await loadPanel(
      CHARTS.requests,
      TIME_RANGES[0],
      new AbortController().signal,
    )

    expect(chart.hasData).toBe(true)
    expect(chart.data).toHaveLength(61)
    expect(chart.data[0].Requests).toBeNull()
    expect(chart.data[30].Requests).toBe(0)
    expect(chart.data[31].Requests).toBeNull()
    expect(chart.data[60].Requests).toBe(12.5)
  })

  it('reports an empty database honestly instead of manufacturing a zero-traffic chart', async () => {
    serveMatrix([])

    const chart = await loadPanel(
      CHARTS.requests,
      TIME_RANGES[0],
      new AbortController().signal,
    )

    expect(chart.hasData).toBe(false)
    expect(chart.data.every(row => row.Requests === null)).toBe(true)
  })

  it('shows newly identified bot families alongside the named dashboard categories', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: ['google', 'crawler:yisouspider', 'bing'].map(
            client_family => ({
              metric: { client_family },
              values: [[end, '4']],
            }),
          ),
        },
      }),
    )

    const chart = await loadPanel(
      CHARTS.buildRequests,
      TIME_RANGES[0],
      new AbortController().signal,
    )

    expect(chart.categories).toEqual(['Google', 'crawler:yisouspider', 'bing'])
    expect(chart.data.at(-1)?.['crawler:yisouspider']).toBe(4)
  })

  it('bounds long-range payloads and aggregates each complete chart interval', async () => {
    serveMatrix([[end, '4']])
    const signal = new AbortController().signal
    const chart = await loadPanel(CHARTS.requests, TIME_RANGES[4], signal)
    const fetchCall = jest.mocked(fetch).mock.calls[0]

    const request = new URL(
      fetchCall[0] instanceof Request ? fetchCall[0].url : fetchCall[0],
      'http://localhost',
    )

    expect(stepSeconds(TIME_RANGES[4].seconds)).toBe(7200)
    expect(chart.data).toHaveLength(181)
    expect(request.searchParams.get('step')).toBe('7200')
    expect(request.searchParams.get('query')).toContain('[7200s]')
    expect(request.searchParams.get('query')).toContain('increase(')
    expect(chart.resolution.label).toBe('2 hours')
    expect(request.searchParams.get('query')).toContain(
      'proxy="bundlephobia_http"',
    )
    expect(fetchCall[1]?.signal).toBe(signal)
    expect(fetchCall[1]?.credentials).toBe('same-origin')
  })
})

describe('API failures and absent summaries', () => {
  it('asks the user to sign in again when HAProxy returns 401', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('Unauthorized', { status: 401 }),
      )
    await expect(
      queryInstant('up', new AbortController().signal),
    ).rejects.toThrow('sign in again')
  })

  it('rejects a successful HTTP response that is not a VictoriaMetrics result', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ status: 'error', error: 'bad query' }),
      )
    await expect(
      queryInstant('up', new AbortController().signal),
    ).rejects.toThrow('unexpected summary response')
  })

  it('leaves missing summary values empty', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        status: 'success',
        data: { resultType: 'vector', result: [] },
      }),
    )

    const summary = await loadSummary(
      TIME_RANGES[0],
      new AbortController().signal,
    )

    expect(summary.requests).toBeNull()
    expect(summary.rate).toBeNull()
    expect(summary.sessions).toBeNull()
    expect(summary.health).toBeNull()
    expect(summary.responses).toEqual([])
  })
})
