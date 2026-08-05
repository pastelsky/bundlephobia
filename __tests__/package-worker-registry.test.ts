import PackageWorkerRegistry, {
  type RedisAffinityClient,
} from '../server/api/PackageWorkerRegistry'
import { rankBuildServiceEndpoints } from '../server/api/buildServiceEndpoints'

class FakeRedis implements RedisAffinityClient {
  values = new Map<string, string>()

  async get(key: string) {
    return this.values.get(key) ?? null
  }

  async set(
    key: string,
    value: string,
    _mode: 'PX',
    _ttl: number,
    _condition: 'NX'
  ): Promise<'OK' | null> {
    if (this.values.has(key)) return null
    this.values.set(key, value)
    return 'OK'
  }

  async eval(
    script: string,
    _numberOfKeys: number,
    key: string,
    expectedValue: string
  ) {
    if (this.values.get(key) !== expectedValue) return 0
    if (script.includes("redis.call('DEL'")) this.values.delete(key)
    return 1
  }
}

const endpoints = [
  'http://127.0.0.1:7002',
  'http://127.0.0.1:7003',
  'http://127.0.0.1:7004',
]

describe('PackageWorkerRegistry', () => {
  it('uses rendezvous hashing without Redis', async () => {
    const registry = new PackageWorkerRegistry()

    await expect(registry.rank('react@19.2.0', endpoints)).resolves.toEqual(
      rankBuildServiceEndpoints('react@19.2.0', endpoints)
    )
  })

  it('atomically gives concurrent callers the same package worker', async () => {
    const registry = new PackageWorkerRegistry(new FakeRedis())

    const [first, second] = await Promise.all([
      registry.rank('react@19.2.0', endpoints),
      registry.rank('react@19.2.0', [...endpoints].reverse()),
    ])

    expect(first[0]).toBe(second[0])
  })

  it('clears affinity only for the recorded worker', async () => {
    const redis = new FakeRedis()
    const registry = new PackageWorkerRegistry(redis)
    const [worker] = await registry.rank('react@19.2.0', endpoints)

    await registry.markUnavailable(
      'react@19.2.0',
      endpoints.find(x => x !== worker)!
    )
    expect((await registry.rank('react@19.2.0', endpoints))[0]).toBe(worker)

    await registry.markUnavailable('react@19.2.0', worker)
    expect(redis.values.size).toBe(0)
  })

  it('falls back to deterministic routing when Redis is unavailable', async () => {
    const redis = new FakeRedis()
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('Redis unavailable'))
    const registry = new PackageWorkerRegistry(redis)

    await expect(registry.rank('react@19.2.0', endpoints)).resolves.toEqual(
      rankBuildServiceEndpoints('react@19.2.0', endpoints)
    )
  })
})
