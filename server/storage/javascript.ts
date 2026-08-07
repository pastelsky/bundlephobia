import Cache from '../../utils/cache.utils'
import firebaseUtils from '../../utils/firebase.utils'
import type {
  LanguageStorageAdapter,
  PackageHistoryStore,
  PackageResultStore,
  RecentSearchStore,
} from './contracts'

export class JavaScriptStorageAdapter
  implements LanguageStorageAdapter<'javascript'>
{
  readonly language = 'javascript' as const

  constructor(cache = new Cache(), firebase = firebaseUtils) {
    this.packageAnalysis = {
      get: identity => cache.getPackageSize(identity),
      set: (identity, result) => cache.setPackageSize(identity, result),
    }
    this.exportSizes = {
      get: identity => cache.getExportsSize(identity),
      set: (identity, result) => cache.setExportsSize(identity, result),
    }
    this.packageHistory = {
      get: (name, limit) => firebase.getPackageHistory(name, limit),
    }
    this.recentSearches = {
      record: (name, packageInfo) =>
        firebase.setRecentSearch(name, packageInfo),
      recent: limit => firebase.getRecentSearches(limit),
      daily: () => firebase.getDailySearches(),
    }
  }

  readonly packageAnalysis: PackageResultStore
  readonly exportSizes: PackageResultStore
  readonly packageHistory: PackageHistoryStore
  readonly recentSearches: RecentSearchStore
}
