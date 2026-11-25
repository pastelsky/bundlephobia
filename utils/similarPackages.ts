import groups from './similar-packages.groups.json'
import catalog from './similar-packages.catalog.json'
import {
  catalogSchema,
  type Catalog,
} from '@bundlephobia/service-contracts/recommendations'

// Broad packages need purpose-level peers rather than plugins matched by tags.
export const comparisonGroups = Object.values(groups)

export type CategoryDefinition = Catalog[string]

export const categories: Catalog = catalogSchema.parse(catalog)
