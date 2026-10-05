export const trendsComparisons = [
  ['react', 'vue'],
  ['react', 'preact'],
  ['react', 'svelte'],
  ['react', '@angular/core'],
  ['date-fns', 'dayjs'],
  ['moment', 'dayjs'],
  ['date-fns', 'luxon'],
  ['lodash', 'ramda'],
  ['lodash', 'underscore'],
  ['axios', 'ky'],
  ['react-hook-form', 'formik'],
  ['zustand', 'jotai'],
  ['zustand', '@reduxjs/toolkit'],
  ['zod', 'yup'],
  ['zod', 'valibot'],
  ['@tanstack/react-query', 'swr'],
  ['recharts', 'chart.js'],
  ['clsx', 'classnames'],
  ['express', 'fastify'],
  ['vite', 'webpack'],
  ['jest', 'vitest'],
] as const

export function trendsComparisonPath(packages: readonly string[]) {
  return `/trends?packages=${packages.map(encodeURIComponent).join('~vs~')}`
}

export function findTrendsComparison(packages: readonly string[]) {
  return trendsComparisons.find(
    comparison =>
      comparison.length === packages.length &&
      comparison.every(name => packages.includes(name)),
  )
}
