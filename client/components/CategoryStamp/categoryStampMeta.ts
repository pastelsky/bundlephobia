import type {
  CategoryStamp,
  StampInk,
} from '@bundlephobia/service-contracts/recommendations'
import treemapColors from '../../config/colors'

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)

  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return [0, 0, l]

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

  let h = 0

  if (max === rn) {
    h = (gn - bn) / delta + (gn < bn ? 6 : 0)
  } else if (max === gn) {
    h = (bn - rn) / delta + 2
  } else {
    h = (rn - gn) / delta + 4
  }

  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const channel = (offset: number) => {
    const k = (offset + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))

    return Math.round(255 * value)
  }

  return [channel(0), channel(8), channel(4)]
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255

    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

// Lift each Treemap hue in HSL to a balanced pastel luminance floor (0.55)
// with gentle saturation preservation (+0.05, capped at 0.84) so stamp inks
// stay airy behind dark linework without washing out or turning neon.
function liftTreemapInk(hex: string, minLuminance = 0.55): string {
  const [r, g, b] = hexToRgb(hex)

  if (relativeLuminance(r, g, b) >= minLuminance) return hex

  const [h, s, l] = rgbToHsl(r, g, b)
  const balancedS = Math.min(0.84, s + 0.05)

  let lo = l
  let hi = 0.92

  for (let step = 0; step < 14; step++) {
    const mid = (lo + hi) / 2
    const [mr, mg, mb] = hslToRgb(h, balancedS, mid)

    if (relativeLuminance(mr, mg, mb) < minLuminance) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const [fr, fg, fb] = hslToRgb(h, balancedS, hi)
  const toHex = (c: number) => c.toString(16).padStart(2, '0')

  return `#${toHex(fr)}${toHex(fg)}${toHex(fb)}`
}

// Derived directly from Bundlephobia's Treemap palette (client/config/colors.ts)
export const STAMP_INK_HEX: Record<StampInk, string> = {
  blue: liftTreemapInk(treemapColors[1]),
  green: liftTreemapInk(treemapColors[6]),
  neptune: liftTreemapInk(treemapColors[5]),
  dandelion: liftTreemapInk(treemapColors[10]),
  orange: liftTreemapInk(treemapColors[12]),
  lilac: liftTreemapInk(treemapColors[15]),
  coral: liftTreemapInk(treemapColors[14]),
}

export const DEFAULT_CATEGORY_STAMP: CategoryStamp = {
  ink: 'blue',
  motion: 'bounce',
  backdrop: [{ type: 'rect', x: 10.5, y: 10.5, width: 18, height: 18, rx: 4 }],
  marks: [
    { type: 'rect', x: 8, y: 8.5, width: 18, height: 6, rx: 2, role: 'stroke' },
    {
      type: 'rect',
      x: 8,
      y: 17.5,
      width: 7.5,
      height: 8,
      rx: 2,
      role: 'stroke',
    },
    {
      type: 'rect',
      x: 18.5,
      y: 17.5,
      width: 7.5,
      height: 8,
      rx: 2,
      role: 'stroke',
    },
  ],
}

export const DEFAULT_CATEGORY_DESCRIPTION =
  'Compare popular npm packages in this category.'
