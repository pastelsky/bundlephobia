import groups from './similar-packages.groups.json'
import catalog from './similar-packages.catalog.json'
import type { Catalog } from '@bundlephobia/service-contracts/recommendations'

// Broad packages need purpose-level peers rather than plugins matched by tags.
export const comparisonGroups = groups

export type CategoryDefinition = Catalog[string]

export const categories: Catalog = catalog
