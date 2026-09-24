import { eachDayOfInterval, format } from 'date-fns'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsRange,
} from '@bundlephobia/service-contracts/trends'
import {
  buildChartModel,
  pathFor,
  seriesForMetric,
} from '../pages/trends/trendsChartModel'
import { groupTrendsPackage, startOfTrendsRange } from '../utils/trends'

const now = new Date('2026-09-20T12:00:00Z')

const ranges: TrendsRange[] = ['last-2-months', 'last-year', 'last-3-years']

const groups: TrendsGroupBy[] = ['day', 'week', 'month']

const metrics: TrendsMetric[] = ['downloads', 'stars', 'size']

function packageSeries(range: TrendsRange, packageIndex: number) {
  const dates = eachDayOfInterval({
    start: startOfTrendsRange(range, now),
    end: now,
  }).map(date => format(date, 'yyyy-MM-dd'))

  const dailyPoints = (base: number) =>
    dates.map((date, index) => ({
      date,
      value: base + index * (packageIndex + 1),
      partial: index === dates.length - 1,
    }))

  const sizeDates = dates.filter(
    (_, index) => index % 17 === 0 || index === dates.length - 1,
  )

  return {
    name: packageIndex === 0 ? 'react' : 'vue',
    repository: packageIndex === 0 ? 'facebook/react' : 'vuejs/core',
    downloads: dailyPoints(1_000_000),
    stars: dailyPoints(100_000),
    size: sizeDates.map((date, index) => ({
      date,
      value: 10_000 + packageIndex * 1_000 + index,
      version: `1.${index}.0`,
    })),
    releases: [],
    current: {
      weeklyDownloads: 1_000_000,
      stars: 100_000,
      size: 10_000,
      gzip: 5_000,
    },
    warnings: [],
  } satisfies TrendsPackageSeries
}

describe.each(ranges)('chart observation invariants for %s', range => {
  describe.each(groups)('%s grouping', groupBy => {
    it.each(metrics)(
      'represents every %s observation at sparse and dense widths',
      metric => {
        const packages = [0, 1].map(packageIndex =>
          groupTrendsPackage(packageSeries(range, packageIndex), groupBy),
        )

        for (const chartWidth of [360, 1_200]) {
          const model = buildChartModel({
            packages,
            metric,
            range,
            groupBy,
            showMajorReleases: true,
            showMinorReleases: true,
            chartWidth,
          })

          expect(model).not.toBeNull()

          if (!model) continue

          for (const [index, rendered] of model.series.entries()) {
            const source = seriesForMetric(packages[index], metric)
            const completeCount = source.filter(point => !point.partial).length
            const partialCount = source.length - completeCount

            const representedCompleteCount = rendered.denseMarkerPath
              ? rendered.points.length
              : rendered.markers.length

            expect(rendered.points).toHaveLength(completeCount)
            expect(rendered.partialMarkers).toHaveLength(partialCount)
            expect(
              representedCompleteCount + rendered.partialMarkers.length,
            ).toBe(source.length)
            expect(pathFor(rendered.points)).not.toContain('NaN')
            expect(
              [...rendered.points, ...rendered.partialMarkers].every(
                point => Number.isFinite(point.x) && Number.isFinite(point.y),
              ),
            ).toBe(true)

            expect(rendered.markers).toHaveLength(
              rendered.denseMarkerPath ? 0 : completeCount,
            )
            expect(rendered.denseMarkerPath).not.toContain('NaN')
          }
        }
      },
    )
  })
})
