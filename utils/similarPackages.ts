import groups from './similar-packages.groups.json'
import catalog from './similar-packages.catalog.json'
import stamps from './similar-packages.stamps.json'
import {
  catalogSchema,
  categoryStampsSchema,
  type Catalog,
  type CategoryStamps,
} from '@bundlephobia/service-contracts/recommendations'

// Broad packages need purpose-level peers rather than plugins matched by tags.
export const comparisonGroups = Object.values(groups)

export type CategoryDefinition = Catalog[string]

export const categories: Catalog = catalogSchema.parse(catalog)

export const categoryStamps: CategoryStamps = categoryStampsSchema.parse(stamps)
