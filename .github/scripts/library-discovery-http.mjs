import { setTimeout as delay } from 'node:timers/promises'
import pThrottle from 'p-throttle'
import pRetry, { AbortError } from 'p-retry'
import config from '../library-discovery.config.json' with { type: 'json' }

export function createDiscoveryClients({
  githubRequest,
  fetchImpl = fetch,
  policy = config.http,
}) {
  const codeSearch = pThrottle({
    limit: 1,
    interval: policy.codeSearchIntervalMs,
    strict: true,
  })(githubRequest)

  const npmRequest = pThrottle({
    limit: 1,
    interval: policy.npmIntervalMs,
    strict: true,
  })(url =>
    fetchImpl(url, {
      signal: AbortSignal.timeout(policy.requestTimeoutMs),
      redirect: 'error',
    }),
  )

  const github = async (route, parameters) =>
    (
      await (route === 'GET /search/code' ? codeSearch : githubRequest)(
        route,
        parameters,
      )
    ).data

  const registry = url =>
    pRetry(
      async () => {
        const response = await npmRequest(url)

        if (response.ok) return response.json()
        await response.body?.cancel()
        const message = `npm returned HTTP ${response.status}`

        if (response.status !== 429 && response.status < 500)
          throw new AbortError(message)
        throw Object.assign(new Error(message), {
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
        })
      },
      {
        retries: policy.retries,
        minTimeout: policy.retryMinTimeoutMs,
        maxRetryTime: policy.maxRetryTimeMs,
        onFailedAttempt: async ({ error, retryDelay, retriesLeft }) => {
          if (!error.retryAfter || !retriesLeft) return
          const seconds = Number(error.retryAfter)

          const wait = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(error.retryAfter) - Date.now()

          if (wait > policy.maxRetryTimeMs) throw error

          if (wait > retryDelay) await delay(wait - retryDelay)
        },
      },
    )

  return { github, registry }
}
