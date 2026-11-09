import { trendsComparisonCanonicalPath } from './trends-comparisons'

export type TrendsCategory = {
  id: string
  title: string
  packages: string[]
  popularPairs: Array<[string, string]>
}

export const TRENDS_CATEGORIES: TrendsCategory[] = [
  {
    id: 'ui-frameworks',
    title: 'UI Frameworks',
    packages: ['react', 'vue', 'svelte', 'solid-js', 'preact'],
    popularPairs: [
      ['react', 'vue'],
      ['react', 'svelte'],
      ['vue', 'svelte'],
      ['preact', 'react'],
      ['solid-js', 'svelte'],
    ],
  },
  {
    id: 'state-management',
    title: 'State Management',
    packages: ['redux', 'zustand', 'jotai', 'mobx', 'recoil'],
    popularPairs: [
      ['redux', 'zustand'],
      ['zustand', 'jotai'],
      ['mobx', 'redux'],
      ['jotai', 'recoil'],
    ],
  },
  {
    id: 'bundlers',
    title: 'Module Bundlers',
    packages: ['vite', 'webpack', 'rollup', 'esbuild', 'parcel'],
    popularPairs: [
      ['vite', 'webpack'],
      ['esbuild', 'rollup'],
      ['rollup', 'webpack'],
      ['esbuild', 'vite'],
    ],
  },
  {
    id: 'server-frameworks',
    title: 'Server Frameworks',
    packages: ['express', 'fastify', 'koa', 'hono', '@nestjs/core'],
    popularPairs: [
      ['express', 'fastify'],
      ['fastify', 'hono'],
      ['express', 'hono'],
      ['fastify', 'koa'],
    ],
  },
  {
    id: 'date-time',
    title: 'Date & Time',
    packages: ['date-fns', 'dayjs', 'luxon', 'moment'],
    popularPairs: [
      ['date-fns', 'dayjs'],
      ['dayjs', 'moment'],
      ['date-fns', 'luxon'],
      ['luxon', 'moment'],
    ],
  },
  {
    id: 'schema-validation',
    title: 'Schema Validation',
    packages: ['zod', 'valibot', 'yup', '@sinclair/typebox'],
    popularPairs: [
      ['yup', 'zod'],
      ['valibot', 'zod'],
      ['@sinclair/typebox', 'valibot'],
      ['valibot', 'yup'],
    ],
  },
  {
    id: 'http-clients',
    title: 'HTTP Clients',
    packages: ['axios', 'ky', 'ofetch', 'got'],
    popularPairs: [
      ['axios', 'ky'],
      ['axios', 'ofetch'],
      ['got', 'ky'],
      ['axios', 'got'],
    ],
  },
  {
    id: 'testing-frameworks',
    title: 'Testing Frameworks',
    packages: ['jest', 'vitest', 'ava', 'mocha'],
    popularPairs: [
      ['jest', 'vitest'],
      ['mocha', 'vitest'],
      ['ava', 'jest'],
    ],
  },
  {
    id: 'classname-utilities',
    title: 'Classname Utilities',
    packages: ['clsx', 'classnames', 'classcat', 'classix'],
    popularPairs: [
      ['classnames', 'clsx'],
      ['classix', 'clsx'],
      ['classcat', 'classnames'],
    ],
  },
  {
    id: 'css-in-js',
    title: 'CSS-in-JS',
    packages: ['styled-components', '@emotion/css', 'jss', 'linaria'],
    popularPairs: [
      ['@emotion/css', 'styled-components'],
      ['linaria', 'styled-components'],
      ['jss', 'styled-components'],
    ],
  },
  {
    id: 'drag-and-drop',
    title: 'Drag & Drop',
    packages: ['sortablejs', '@shopify/draggable', 'dragula'],
    popularPairs: [
      ['@shopify/draggable', 'sortablejs'],
      ['dragula', 'sortablejs'],
    ],
  },
  {
    id: 'full-text-search',
    title: 'Text Search',
    packages: ['fuse.js', 'minisearch', 'flexsearch', 'lunr'],
    popularPairs: [
      ['flexsearch', 'fuse.js'],
      ['fuse.js', 'minisearch'],
      ['lunr', 'minisearch'],
    ],
  },
]

export function getCategoryCompareAllPath(category: TrendsCategory) {
  return trendsComparisonCanonicalPath(category.packages.slice(0, 5))
}
