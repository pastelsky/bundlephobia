import {
  getBuildServiceEndpoints,
  rankBuildServiceEndpoints,
} from '../server/api/buildServiceEndpoints'

describe('build service routing', () => {
  const originalEndpoints = process.env.BUILD_SERVICE_ENDPOINTS
  const originalEndpoint = process.env.BUILD_SERVICE_ENDPOINT

  afterEach(() => {
    if (originalEndpoints === undefined) {
      delete process.env.BUILD_SERVICE_ENDPOINTS
    } else {
      process.env.BUILD_SERVICE_ENDPOINTS = originalEndpoints
    }
    if (originalEndpoint === undefined) {
      delete process.env.BUILD_SERVICE_ENDPOINT
    } else {
      process.env.BUILD_SERVICE_ENDPOINT = originalEndpoint
    }
  })

  it('parses the endpoint list and preserves the single-endpoint fallback', () => {
    process.env.BUILD_SERVICE_ENDPOINTS =
      'http://localhost:7002/, http://localhost:7003'
    expect(getBuildServiceEndpoints()).toEqual([
      'http://localhost:7002',
      'http://localhost:7003',
    ])

    delete process.env.BUILD_SERVICE_ENDPOINTS
    process.env.BUILD_SERVICE_ENDPOINT = 'http://localhost:7002'
    expect(getBuildServiceEndpoints()).toEqual(['http://localhost:7002'])
  })

  it('routes every analysis for an exact package version to one worker', () => {
    const endpoints = [
      'http://localhost:7002',
      'http://localhost:7003',
      'http://localhost:7004',
    ]

    expect(rankBuildServiceEndpoints('ky@1.10.0', endpoints)[0]).toBe(
      rankBuildServiceEndpoints('ky@1.10.0', endpoints)[0]
    )
    expect(
      new Set(
        ['ky@1.10.0', 'react@19.1.1', 'three@0.179.1', 'date-fns@4.1.0'].map(
          packageString =>
            rankBuildServiceEndpoints(packageString, endpoints)[0]
        )
      ).size
    ).toBeGreaterThan(1)
  })

  it('keeps the same preferred worker when unrelated workers change', () => {
    const endpoints = [
      'http://localhost:7002',
      'http://localhost:7003',
      'http://localhost:7004',
    ]
    const ranked = rankBuildServiceEndpoints('ky@1.10.0', endpoints)

    expect(
      rankBuildServiceEndpoints(
        'ky@1.10.0',
        endpoints.filter(endpoint => endpoint !== ranked[2])
      )[0]
    ).toBe(ranked[0])
    expect(
      rankBuildServiceEndpoints('ky@1.10.0', [
        ...endpoints,
        'http://localhost:7005',
      ]).filter(endpoint => endpoints.includes(endpoint))
    ).toEqual(ranked)
  })
})
