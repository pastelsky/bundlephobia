import colors from '../../client/config/colors'

export type LoaderPoint = { x: number; y: number }

export type LoaderCurve = {
  d: string
  color: string
  grayscale: string
  initialOpacity: number
  peakOpacity: number
  delay: number
  duration: number
  colorDuration: number
  holdDuration: number
  fadeDuration: number
}

export type LoaderData = {
  curves: LoaderCurve[]
  nodes: Array<
    LoaderPoint & {
      color: string
      curveIndex: number
      appearanceDelay: number
    }
  >
}

export type LoaderShape = number[]

export const DRAW_EASINGS = [
  'easeInCubic',
  'easeOutCubic',
  'easeOutQuad',
  'easeOutQuad',
] as const

export const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min)

export const randomInteger = (min: number, max: number) =>
  Math.floor(randomBetween(min, max + 1))

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const debugLoader = (event: string, details?: unknown) => {
  if (
    typeof window !== 'undefined' &&
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production'
  ) {
    console.debug(
      `[trends-loader] ${event}${
        details === undefined ? '' : ` ${JSON.stringify(details)}`
      }`
    )
  }
}

export function lightenColor(color: string, amount = 0.38) {
  const match = color.match(/^#([\da-f]{6})$/i)
  if (!match) return color
  const channels = [0, 2, 4].map(offset =>
    parseInt(match[1].slice(offset, offset + 2), 16)
  )
  return `rgb(${channels
    .map(channel => Math.round(channel + (255 - channel) * amount))
    .join(', ')})`
}

export function inverseEasing(
  value: number,
  easing: (elapsed: number) => number
) {
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2
    if (easing(middle) < value) low = middle
    else high = middle
  }
  return (low + high) / 2
}

export function pathDistanceAtPoint(path: SVGPathElement, point: LoaderPoint) {
  const length = path.getTotalLength()
  const samples = 120
  let closestDistance = 0
  let closestDelta = Number.POSITIVE_INFINITY

  for (let index = 0; index <= samples; index += 1) {
    const distance = (length * index) / samples
    const candidate = path.getPointAtLength(distance)
    const delta = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2
    if (delta < closestDelta) {
      closestDistance = distance
      closestDelta = delta
    }
  }

  let low = Math.max(0, closestDistance - length / samples)
  let high = Math.min(length, closestDistance + length / samples)
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const first = low + (high - low) / 3
    const second = high - (high - low) / 3
    const firstPoint = path.getPointAtLength(first)
    const secondPoint = path.getPointAtLength(second)
    const firstDelta =
      (firstPoint.x - point.x) ** 2 + (firstPoint.y - point.y) ** 2
    const secondDelta =
      (secondPoint.x - point.x) ** 2 + (secondPoint.y - point.y) ** 2
    if (firstDelta < secondDelta) high = second
    else low = first
  }

  return (low + high) / 2 / length
}

function createCurve(pointCount: number): { d: string; points: LoaderPoint[] } {
  const left = 0
  const right = randomBetween(1088, 1140)
  const startY = randomBetween(75, 305)
  const endY = clamp(startY + randomBetween(-150, 150), 45, 330)
  const amplitude = randomBetween(38, 88)
  const waveCount = randomBetween(1.05, 2)
  const phase = randomBetween(-Math.PI * 0.35, Math.PI * 0.35)
  const secondaryAmplitude = randomBetween(16, 34)
  const secondaryWaveCount = randomBetween(2.4, 4)
  const secondaryPhase = randomBetween(-Math.PI, Math.PI)
  const points: LoaderPoint[] = Array.from(
    { length: pointCount },
    (_, index) => {
      const progress = index / (pointCount - 1)
      const x =
        index === 0
          ? left
          : index === pointCount - 1
          ? right
          : clamp(
              left + progress * (right - left) + randomBetween(-45, 45),
              left + 18,
              right - 18
            )
      const trend = startY + (endY - startY) * progress
      const wave = Math.sin(progress * Math.PI * waveCount + phase) * amplitude
      const edgeWeight = Math.sin(progress * Math.PI)
      const secondaryWave =
        Math.sin(progress * Math.PI * secondaryWaveCount + secondaryPhase) *
        secondaryAmplitude
      const detail = randomBetween(-22, 22) * edgeWeight

      return {
        x,
        y: clamp(trend + (wave + secondaryWave) * edgeWeight + detail, 30, 340),
      }
    }
  ).sort((a, b) => a.x - b.x)

  let d = `M ${points[0].x},${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const previous = points[index - 1] || current
    const following = points[index + 2] || next
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    }
    const control2 = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    }
    d += ` C ${control1.x},${clamp(control1.y, 20, 350)} ${control2.x},${clamp(
      control2.y,
      20,
      350
    )} ${next.x},${next.y}`
  }

  return { d, points }
}

export function generateRandomLoaderData(shape?: LoaderShape): LoaderData & {
  shape: LoaderShape
} {
  const shuffledColors = [...colors].sort(() => Math.random() - 0.5)
  const nextShape =
    shape ||
    Array.from({ length: randomInteger(3, 4) }, () => randomInteger(5, 6))
  const curves: LoaderCurve[] = []
  const nodes: LoaderData['nodes'] = []

  for (let index = 0; index < nextShape.length; index += 1) {
    const { d, points } = createCurve(nextShape[index])
    const color = shuffledColors[index % shuffledColors.length]
    const delay = randomInteger(30, 75)
    const shade = randomInteger(92, 190)
    curves.push({
      d,
      color,
      grayscale: `rgb(${shade}, ${shade}, ${shade})`,
      initialOpacity: randomBetween(0.12, 0.28),
      peakOpacity: randomBetween(0.34, 0.5),
      delay,
      duration: randomInteger(1700, 2900),
      colorDuration: randomInteger(260, 620),
      holdDuration: randomInteger(520, 850),
      fadeDuration: randomInteger(550, 850),
    })

    let appearanceDelay = randomInteger(0, 60)
    points.slice(1, -1).forEach(point => {
      nodes.push({ ...point, color, curveIndex: index, appearanceDelay })
      appearanceDelay += randomInteger(85, 135)
    })
  }

  return { curves, nodes, shape: nextShape }
}
