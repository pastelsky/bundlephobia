import { createHash } from 'crypto'
import createDebug from 'debug'

import { rankBuildServiceEndpoints } from './buildServiceEndpoints'

const debug = createDebug('bp:build-worker')
const AFFINITY_TTL_MS = 5 * 60_000
const REDIS_DEADLINE_MS = 250

const compareAndDelete = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

const compareAndRefresh = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`

export interface RedisAffinityClient {
  get(key: string): Promise<string | null>
  set(
    key: string,
    value: string,
    mode: 'PX',
    ttl: number,
    condition: 'NX'
  ): Promise<'OK' | null>
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    ...args: Array<string | number>
  ): Promise<unknown>
}

async function withinRedisDeadline<TResult>(operation: Promise<TResult>) {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Redis package-worker lookup timed out')),
      REDIS_DEADLINE_MS
    )
    timer.unref()
  })

  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Keeps closely related package analyses on the same addressable worker. */
export default class PackageWorkerRegistry {
  constructor(private readonly redis?: RedisAffinityClient) {}

  private key(packageString: string) {
    const digest = createHash('sha256').update(packageString).digest('hex')
    return `bundlephobia:build-worker:${digest}`
  }

  async rank(packageString: string, endpoints: string[]) {
    const rankedEndpoints = rankBuildServiceEndpoints(packageString, endpoints)
    if (!this.redis || rankedEndpoints.length < 2) return rankedEndpoints

    const key = this.key(packageString)
    try {
      let worker = await withinRedisDeadline(this.redis.get(key))
      if (worker && !endpoints.includes(worker)) {
        await this.markUnavailable(packageString, worker)
        worker = null
      }

      if (!worker) {
        await withinRedisDeadline(
          this.redis.set(key, rankedEndpoints[0], 'PX', AFFINITY_TTL_MS, 'NX')
        )
        worker = await withinRedisDeadline(this.redis.get(key))
      }

      if (!worker || !endpoints.includes(worker)) return rankedEndpoints

      await withinRedisDeadline(
        this.redis.eval(compareAndRefresh, 1, key, worker, AFFINITY_TTL_MS)
      )
      return [
        worker,
        ...rankedEndpoints.filter(endpoint => endpoint !== worker),
      ]
    } catch (error) {
      // Stable rendezvous hashing remains a safe same-host fallback if Redis
      // is unavailable; Redis only shares worker affinity across web processes.
      debug('Redis package-worker lookup failed: %O', error)
      return rankedEndpoints
    }
  }

  async markUnavailable(packageString: string, endpoint: string) {
    if (!this.redis) return
    try {
      await withinRedisDeadline(
        this.redis.eval(compareAndDelete, 1, this.key(packageString), endpoint)
      )
    } catch (error) {
      debug('Redis package-worker release failed: %O', error)
    }
  }
}
