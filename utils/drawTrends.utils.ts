import * as fabric from 'fabric/node'

import type {
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
} from '../server/trends/types'

type ThemeName = 'dark' | 'light'

type DrawTrendsImgOptions = {
  packages: TrendsPackageSeries[]
  metric: TrendsMetric
  theme?: ThemeName
}

const SERIES_COLORS = ['#7cd690', '#65a1f8', '#eb841f', '#82b5b3', '#c084fc']

const lightTheme = {
  backgroundColor: '#ffffff',
  titleColor: '#212121',
  mutedColor: '#666e78',
  gridColor: '#e8edf2',
  axisColor: '#9aa3ad',
}

const darkTheme = {
  backgroundColor: '#182330',
  titleColor: '#f0f6fc',
  mutedColor: '#9aa7b5',
  gridColor: 'rgba(255,255,255,0.08)',
  axisColor: 'rgba(255,255,255,0.35)',
}

function metricLabel(metric: TrendsMetric) {
  switch (metric) {
    case 'downloads':
      return 'npm downloads'
    case 'stars':
      return 'GitHub stars'
    case 'issues':
      return 'Open issues'
    case 'size':
      return 'Gzip size (cached)'
    default:
      return metric
  }
}

function seriesForMetric(
  pack: TrendsPackageSeries,
  metric: TrendsMetric
): TrendsPoint[] {
  switch (metric) {
    case 'downloads':
      return pack.downloads
    case 'stars':
      return pack.stars
    case 'issues':
      return pack.issues
    case 'size':
      return pack.size
    default:
      return []
  }
}

function formatCompact(value: number, metric: TrendsMetric) {
  if (metric === 'size') {
    if (value < 1024) return `${Math.round(value)}B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}kB`
    return `${(value / (1024 * 1024)).toFixed(1)}MB`
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}

function downsample(points: TrendsPoint[], maxPoints: number) {
  if (points.length <= maxPoints) {
    return points
  }
  const step = Math.ceil(points.length / maxPoints)
  const sampled: TrendsPoint[] = []
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i])
  }
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last)
  }
  return sampled
}

export function drawTrendsImg({
  packages,
  metric,
  theme = 'dark',
}: DrawTrendsImgOptions) {
  const selectedTheme = theme === 'light' ? lightTheme : darkTheme
  const width = 1200
  const height = 630
  const padLeft = 72
  const padRight = 36
  const padTop = 110
  const padBottom = 70
  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom

  const canvas = new fabric.StaticCanvas(undefined, {
    backgroundColor: selectedTheme.backgroundColor,
    width,
    height,
  })

  const title = packages.map(pack => pack.name).join(' vs ')
  canvas.add(
    new fabric.Text('Bundlephobia Trends', {
      left: 36,
      top: 28,
      fontFamily: 'SF Compact Text, Helvetica, Arial',
      fontSize: 22,
      fill: selectedTheme.mutedColor,
      fontWeight: 500,
    })
  )
  canvas.add(
    new fabric.Text(title.slice(0, 72) || 'Compare packages', {
      left: 36,
      top: 56,
      fontFamily: 'Source Code Pro, Menlo, monospace',
      fontSize: 34,
      fill: selectedTheme.titleColor,
      fontWeight: 'bold',
    })
  )
  canvas.add(
    new fabric.Text(metricLabel(metric), {
      left: width - 36,
      top: 34,
      originX: 'right',
      fontFamily: 'SF Compact Text, Helvetica, Arial',
      fontSize: 20,
      fill: selectedTheme.mutedColor,
    })
  )

  const seriesList = packages.map((pack, index) => ({
    name: pack.name,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    points: downsample(seriesForMetric(pack, metric), 90),
  }))

  const allPoints = seriesList.flatMap(series => series.points)
  if (allPoints.length === 0) {
    canvas.add(
      new fabric.Text('No trend data available yet', {
        left: width / 2,
        top: height / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: 'SF Compact Text, Helvetica, Arial',
        fontSize: 28,
        fill: selectedTheme.mutedColor,
      })
    )
    canvas.renderAll()
    return canvas.createJPEGStream({ quality: 0.92 })
  }

  const minDate = allPoints.reduce(
    (min, point) => (point.date < min ? point.date : min),
    allPoints[0].date
  )
  const maxDate = allPoints.reduce(
    (max, point) => (point.date > max ? point.date : max),
    allPoints[0].date
  )
  const minValue = 0
  const maxValue = Math.max(...allPoints.map(point => point.value), 1)
  const minTime = Date.parse(minDate)
  const maxTime = Date.parse(maxDate)
  const timeSpan = Math.max(maxTime - minTime, 1)

  const xFor = (date: string) =>
    padLeft + ((Date.parse(date) - minTime) / timeSpan) * chartWidth
  const yFor = (value: number) =>
    padTop + chartHeight - (value / maxValue) * chartHeight

  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (chartHeight * i) / 4
    canvas.add(
      new fabric.Line([padLeft, y, padLeft + chartWidth, y], {
        stroke: selectedTheme.gridColor,
        strokeWidth: 1,
        selectable: false,
      })
    )
    const tickValue = maxValue * (1 - i / 4)
    canvas.add(
      new fabric.Text(formatCompact(tickValue, metric), {
        left: padLeft - 12,
        top: y,
        originX: 'right',
        originY: 'center',
        fontFamily: 'SF Compact Text, Helvetica, Arial',
        fontSize: 16,
        fill: selectedTheme.axisColor,
      })
    )
  }

  seriesList.forEach(series => {
    if (series.points.length < 2) {
      if (series.points.length === 1) {
        const point = series.points[0]
        canvas.add(
          new fabric.Circle({
            left: xFor(point.date),
            top: yFor(point.value),
            radius: 5,
            fill: series.color,
            originX: 'center',
            originY: 'center',
          })
        )
      }
      return
    }

    const pathData = series.points
      .map((point, index) => {
        const command = index === 0 ? 'M' : 'L'
        return `${command} ${xFor(point.date)} ${yFor(point.value)}`
      })
      .join(' ')

    canvas.add(
      new fabric.Path(pathData, {
        fill: '',
        stroke: series.color,
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      })
    )
  })

  // Overlays: major releases as faint ticks on first package
  const primary = packages[0]
  if (primary) {
    primary.releases.forEach(release => {
      if (release.date < minDate || release.date > maxDate) {
        return
      }
      const x = xFor(release.date)
      canvas.add(
        new fabric.Line([x, padTop, x, padTop + chartHeight], {
          stroke: selectedTheme.axisColor,
          strokeWidth: 1,
          strokeDashArray: [4, 4],
          opacity: 0.55,
        })
      )
    })
  }

  seriesList.forEach((series, index) => {
    const left = 36 + index * 210
    canvas.add(
      new fabric.Circle({
        left,
        top: height - 34,
        radius: 6,
        fill: series.color,
        originX: 'center',
        originY: 'center',
      })
    )
    canvas.add(
      new fabric.Text(series.name, {
        left: left + 14,
        top: height - 44,
        fontFamily: 'Source Code Pro, Menlo, monospace',
        fontSize: 18,
        fill: selectedTheme.titleColor,
      })
    )
  })

  canvas.add(
    new fabric.Text(minDate, {
      left: padLeft,
      top: height - 34,
      originY: 'center',
      fontFamily: 'SF Compact Text, Helvetica, Arial',
      fontSize: 14,
      fill: selectedTheme.axisColor,
    })
  )
  canvas.add(
    new fabric.Text(maxDate, {
      left: padLeft + chartWidth,
      top: height - 34,
      originX: 'right',
      originY: 'center',
      fontFamily: 'SF Compact Text, Helvetica, Arial',
      fontSize: 14,
      fill: selectedTheme.axisColor,
    })
  )

  canvas.renderAll()
  return canvas.createJPEGStream({ quality: 0.92 })
}
