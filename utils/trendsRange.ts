import { format, subMonths, subYears } from 'date-fns'

import type { TrendsRange } from '@bundlephobia/service-contracts/trends'

export function formatTrendsDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function startOfTrendsRange(range: TrendsRange, now = new Date()): Date {
  return range === 'last-2-months'
    ? subMonths(now, 2)
    : subYears(now, range === 'last-year' ? 1 : 3)
}
