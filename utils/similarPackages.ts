import catalog from './similar-packages.catalog.json'

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

export interface CategoryDefinition {
  name: string
  tags: Array<{ tag: string; weight: number }>
  similar: string[]
}

export const categories: Record<string, CategoryDefinition> = catalog
