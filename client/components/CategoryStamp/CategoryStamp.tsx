import React from 'react'
import type {
  CategoryStamp as CategoryStampData,
  StampInk,
  StampMark,
  StampMarkRole,
} from '@bundlephobia/service-contracts/recommendations'
import { STAMP_INK_HEX } from './categoryStampMeta'

type MarkSvgStyle = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'round'
  strokeLinejoin?: 'round'
  opacity?: number
  strokeDasharray?: string
  transform?: string
}

const ROLE_STYLES: Record<StampMarkRole, MarkSvgStyle> = {
  stroke: {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  thin: {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  fill: {
    fill: 'currentColor',
  },
  cutout: {
    fill: 'var(--stamp-cutout, var(--color-bg-base))',
  },
  'cutout-stroke': {
    fill: 'var(--stamp-cutout, var(--color-bg-base))',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  'cutout-thin': {
    fill: 'var(--stamp-cutout, var(--color-bg-base))',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
}

function buildMarkStyle(mark: StampMark, base: MarkSvgStyle): MarkSvgStyle {
  const style: MarkSvgStyle = { ...base }

  if (mark.opacity !== undefined) style.opacity = mark.opacity

  if (mark.dashed) style.strokeDasharray = '3 2.5'

  if (mark.rotate) {
    style.transform = `rotate(${mark.rotate[0]} ${mark.rotate[1]} ${mark.rotate[2]})`
  }

  return style
}

function renderMark(mark: StampMark, key: string, base: MarkSvgStyle) {
  const style = buildMarkStyle(mark, base)

  switch (mark.type) {
    case 'path':
      return <path key={key} d={mark.d} {...style} />
    case 'circle':
      return (
        <circle key={key} cx={mark.cx} cy={mark.cy} r={mark.r} {...style} />
      )
    case 'rect':
      return (
        <rect
          key={key}
          x={mark.x}
          y={mark.y}
          width={mark.width}
          height={mark.height}
          rx={mark.rx}
          {...style}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          key={key}
          cx={mark.cx}
          cy={mark.cy}
          rx={mark.rx}
          ry={mark.ry}
          {...style}
        />
      )
    case 'line':
      return (
        <line
          key={key}
          x1={mark.x1}
          y1={mark.y1}
          x2={mark.x2}
          y2={mark.y2}
          {...style}
        />
      )
    case 'polygon':
      return <polygon key={key} points={mark.points} {...style} />
  }
}

function backdropFill(ink: StampInk, override?: StampInk): string {
  return STAMP_INK_HEX[override ?? ink]
}

export function CategoryStampDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        {/* Risograph paper-tooth speckle mask applied to stamp pastel fills */}
        <pattern
          id="riso-pat-speckle"
          width="13"
          height="13"
          patternUnits="userSpaceOnUse"
        >
          <rect width="13" height="13" fill="white" />
          <circle cx="2.2" cy="2.6" r="0.42" fill="black" />
          <circle cx="7.8" cy="1.8" r="0.3" fill="black" />
          <circle cx="11.1" cy="5.4" r="0.38" fill="black" />
          <circle cx="4.6" cy="7.2" r="0.34" fill="black" />
          <circle cx="8.9" cy="9.8" r="0.44" fill="black" />
          <circle cx="1.9" cy="10.9" r="0.3" fill="black" opacity="0.75" />
        </pattern>
        <mask
          id="riso-mask-speckle"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="36"
          height="36"
        >
          <rect width="36" height="36" fill="url(#riso-pat-speckle)" />
        </mask>
      </defs>
    </svg>
  )
}

export default function CategoryStamp({
  stamp,
  size = 32,
}: {
  stamp: CategoryStampData
  size?: number
}) {
  return (
    <span
      className={`trends-stamp trends-stamp--${stamp.motion}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" width={size} height={size} fill="none">
        <g className="trends-stamp__ink-layer">
          <g mask="url(#riso-mask-speckle)" opacity="0.8">
            {stamp.backdrop.map((mark, index) =>
              renderMark(mark, `bg-${index}`, {
                fill: backdropFill(stamp.ink, mark.color),
              }),
            )}
          </g>
        </g>
        <g className="trends-stamp__line-layer">
          {stamp.marks.map((mark, index) =>
            renderMark(mark, `fg-${index}`, ROLE_STYLES[mark.role ?? 'stroke']),
          )}
        </g>
      </svg>
    </span>
  )
}
