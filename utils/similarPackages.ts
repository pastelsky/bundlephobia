import catalog from './similar-packages.catalog.json'
import type { Catalog } from '@bundlephobia/service-contracts/recommendations'

// Broad packages need purpose-level peers rather than plugins matched by tags.
export const comparisonGroups = [
  {
    packages: [
      'react',
      'preact',
      'vue',
      'svelte',
      'solid-js',
      '@angular/core',
      'lit',
    ],
  },
  { packages: ['express', 'fastify', 'koa', 'hono', '@nestjs/core'] },
  { packages: ['vite', 'webpack', 'rollup', 'esbuild', 'parcel'] },
  { packages: ['jest', 'vitest', 'ava', 'mocha'] },
  { packages: ['redux', 'zustand', 'jotai', 'mobx', 'recoil'] },
  { packages: ['date-fns', 'dayjs', 'luxon', 'moment'] },
]

export type CategoryDefinition = Catalog[string]

export const categories: Catalog = catalog
