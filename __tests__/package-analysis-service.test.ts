import { PackageAnalysisService } from '../server/services/packageAnalysis.service'

const cachedResult = {
  name: 'react',
  version: '18.2.0',
  description: 'React',
  repository: 'https://github.com/facebook/react',
  size: 6500,
  gzip: 2600,
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: true,
  hasJSNext: false,
  isModuleType: false,
}

function createService() {
  const cache = {
    getPackageSize: jest.fn(),
    setPackageSize: jest.fn(),
  }
  const resolve = jest.fn()
  const build = jest.fn()
  const service = new PackageAnalysisService({
    cache: cache as never,
    resolve: resolve as never,
    build,
  })

  return { service, cache, resolve, build }
}

describe('PackageAnalysisService', () => {
  it('answers exact-version cache hits without consulting npm', async () => {
    const { service, cache, resolve, build } = createService()
    cache.getPackageSize.mockResolvedValue(cachedResult)

    await expect(
      service.analyze('react@18.2.0', { mode: 'cache-only' })
    ).resolves.toEqual(
      expect.objectContaining({ result: cachedResult, source: 'cache' })
    )
    expect(resolve).not.toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
  })

  it('returns a cache-only miss without invoking the builder', async () => {
    const { service, cache, resolve, build } = createService()
    cache.getPackageSize.mockResolvedValue(undefined)
    resolve.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      description: 'React',
      repository: { url: 'git+https://github.com/facebook/react.git' },
    })

    await expect(
      service.analyze('react@18.2.0', { mode: 'cache-only' })
    ).resolves.toEqual(
      expect.objectContaining({ result: null, source: 'miss' })
    )
    expect(cache.getPackageSize).toHaveBeenCalledTimes(1)
    expect(build).not.toHaveBeenCalled()
  })

  it('builds and caches only when build-on-miss is requested', async () => {
    const { service, cache, resolve, build } = createService()
    cache.getPackageSize.mockResolvedValue(undefined)
    resolve.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      description: 'React',
      repository: { url: 'git+https://github.com/facebook/react.git' },
    })
    build.mockResolvedValue({
      size: 6500,
      gzip: 2600,
      dependencyCount: 0,
      hasSideEffects: false,
      hasJSModule: true,
      hasJSNext: false,
      isModuleType: false,
    })

    const analysis = await service.analyze('react', {
      mode: 'build-on-miss',
      priority: 7,
    })

    expect(analysis.source).toBe('build')
    expect(build).toHaveBeenCalledWith('react@18.2.0', 7)
    expect(cache.setPackageSize).toHaveBeenCalledWith(
      { name: 'react', version: '18.2.0' },
      expect.objectContaining({
        name: 'react',
        version: '18.2.0',
        repository: 'https://github.com/facebook/react.git',
      })
    )
  })

  it('bypasses cache reads for forced builds', async () => {
    const { service, cache, resolve, build } = createService()
    resolve.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      description: 'React',
      repository: '',
    })
    build.mockResolvedValue({
      size: 6500,
      gzip: 2600,
      dependencyCount: 0,
      hasSideEffects: false,
      hasJSModule: true,
      hasJSNext: false,
      isModuleType: false,
    })

    await service.analyze('react@18.2.0', {
      mode: 'build-on-miss',
      force: true,
    })

    expect(cache.getPackageSize).not.toHaveBeenCalled()
    expect(build).toHaveBeenCalled()
  })
})
