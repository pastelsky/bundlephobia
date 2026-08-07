import {
  getLanguageStorageAdapter,
  JavaScriptStorageAdapter,
} from '../server/storage'

describe('language storage adapters', () => {
  it('keeps JavaScript on the existing cache and Firebase implementations', async () => {
    const cache = {
      getPackageSize: jest.fn().mockResolvedValue({ size: 1 }),
      setPackageSize: jest.fn().mockResolvedValue(undefined),
      getExportsSize: jest.fn().mockResolvedValue({ assets: [] }),
      setExportsSize: jest.fn().mockResolvedValue(undefined),
    }
    const firebase = {
      getPackageHistory: jest.fn().mockResolvedValue({ '1.0.0': {} }),
      setRecentSearch: jest.fn(),
      getRecentSearches: jest.fn().mockResolvedValue({ example: {} }),
      getDailySearches: jest.fn().mockResolvedValue({ example: {} }),
    }
    const adapter = new JavaScriptStorageAdapter(
      cache as never,
      firebase as never
    )
    const identity = { name: 'example', version: '1.0.0' }

    await adapter.packageAnalysis.get(identity)
    await adapter.packageAnalysis.set(identity, { size: 1 })
    await adapter.exportSizes.get(identity)
    await adapter.exportSizes.set(identity, { assets: [] })
    await adapter.packageHistory.get('example', 5)
    adapter.recentSearches.record('example', identity)
    await adapter.recentSearches.recent(5)
    await adapter.recentSearches.daily()

    expect(cache.getPackageSize).toHaveBeenCalledWith(identity)
    expect(cache.setPackageSize).toHaveBeenCalledWith(identity, { size: 1 })
    expect(cache.getExportsSize).toHaveBeenCalledWith(identity)
    expect(cache.setExportsSize).toHaveBeenCalledWith(identity, { assets: [] })
    expect(firebase.getPackageHistory).toHaveBeenCalledWith('example', 5)
    expect(firebase.setRecentSearch).toHaveBeenCalledWith('example', identity)
    expect(firebase.getRecentSearches).toHaveBeenCalledWith(5)
    expect(firebase.getDailySearches).toHaveBeenCalled()
  })

  it.each(['java', 'kotlin'] as const)(
    'does not choose a storage backend for disabled %s support',
    language => {
      const adapter = getLanguageStorageAdapter(language)

      expect(adapter.language).toBe(language)
      expect(adapter.packageAnalysis).toBeUndefined()
      expect(adapter.exportSizes).toBeUndefined()
      expect(adapter.packageHistory).toBeUndefined()
      expect(adapter.recentSearches).toBeUndefined()
    }
  )
})
