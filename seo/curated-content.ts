export type CuratedCategory = {
  slug: string
  title: string
  description: string
  packages: string[]
}

export type CuratedComparison = CuratedCategory & {
  guidance: string
}

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    slug: 'schema-validation',
    title: 'JavaScript schema validation libraries',
    description:
      'Compare the bundle cost and module support of popular runtime schema validation packages.',
    packages: ['zod', 'yup', 'joi', 'superstruct', 'ajv'],
  },
  {
    slug: 'state-management',
    title: 'React state management libraries',
    description:
      'Compare focused stores, atomic state, state machines, and Redux-based packages by their browser cost.',
    packages: ['zustand', 'jotai', '@reduxjs/toolkit', 'mobx', 'xstate'],
  },
  {
    slug: 'data-fetching',
    title: 'React data fetching libraries',
    description:
      'Compare client caches and GraphQL clients before choosing a data layer for a React application.',
    packages: [
      '@tanstack/react-query',
      'swr',
      '@apollo/client',
      'urql',
      'graphql-request',
    ],
  },
  {
    slug: 'date-time',
    title: 'JavaScript date and time libraries',
    description:
      'Compare modern date utilities and full date-time libraries, including their minified and gzip sizes.',
    packages: ['date-fns', 'dayjs', 'luxon', 'moment', 'moment-timezone'],
  },
  {
    slug: 'forms',
    title: 'React form libraries',
    description:
      'Compare form state and validation packages for React by bundle size, dependencies, and module support.',
    packages: ['react-hook-form', 'formik', 'final-form', 'react-final-form'],
  },
  {
    slug: 'charts',
    title: 'JavaScript chart libraries',
    description:
      'Compare charting packages by install cost before adding a visualization library to your frontend.',
    packages: ['recharts', 'chart.js', 'echarts', 'victory', 'apexcharts'],
  },
]

export const CURATED_COMPARISONS: CuratedComparison[] = [
  {
    slug: 'zod-vs-yup-vs-joi',
    title: 'Zod vs Yup vs Joi',
    description:
      'Compare the bundle size, dependencies, and module support of Zod, Yup, and Joi.',
    guidance:
      'Bundle size is one constraint. Also compare type inference, browser support, validation features, and the amount of each API your application imports.',
    packages: ['zod', 'yup', 'joi'],
  },
  {
    slug: 'tanstack-query-vs-swr',
    title: 'TanStack Query vs SWR',
    description:
      'Compare the browser cost of TanStack Query and SWR for server-state management in React.',
    guidance:
      'Choose based on cache workflows and framework integration as well as size. The measured package build represents the complete package entry point.',
    packages: ['@tanstack/react-query', 'swr'],
  },
  {
    slug: 'date-fns-vs-dayjs-vs-luxon',
    title: 'date-fns vs Day.js vs Luxon',
    description:
      'Compare popular JavaScript date libraries by minified size, gzip size, and dependency count.',
    guidance:
      'Modular imports can make real application cost differ from a complete package build. Check the package page and export analysis for your import pattern.',
    packages: ['date-fns', 'dayjs', 'luxon'],
  },
  {
    slug: 'zustand-vs-jotai-vs-redux-toolkit',
    title: 'Zustand vs Jotai vs Redux Toolkit',
    description:
      'Compare three React state management approaches by package size and module support.',
    guidance:
      'The libraries solve different state-modeling problems. Use size as a constraint after matching the state model to the application.',
    packages: ['zustand', 'jotai', '@reduxjs/toolkit'],
  },
  {
    slug: 'react-hook-form-vs-formik',
    title: 'React Hook Form vs Formik',
    description:
      'Compare React Hook Form and Formik by bundle size, dependencies, and tree-shaking signals.',
    guidance:
      'Consider render behavior, validation integration, and migration cost together with the package measurements.',
    packages: ['react-hook-form', 'formik'],
  },
  {
    slug: 'recharts-vs-chartjs',
    title: 'Recharts vs Chart.js',
    description:
      'Compare Recharts and Chart.js before choosing a charting dependency for a frontend project.',
    guidance:
      'These packages expose different rendering and component models. Compare the features your chart needs before treating total package size as the deciding factor.',
    packages: ['recharts', 'chart.js'],
  },
]

export const CURATED_PACKAGE_NAMES = Array.from(
  new Set(
    [...CURATED_CATEGORIES, ...CURATED_COMPARISONS].flatMap(
      page => page.packages
    )
  )
)

export function findCuratedCategory(slug: string) {
  return CURATED_CATEGORIES.find(category => category.slug === slug)
}

export function findCuratedComparison(slug: string) {
  return CURATED_COMPARISONS.find(comparison => comparison.slug === slug)
}
