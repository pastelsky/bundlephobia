import React from 'react'

type TreemapSquareProps = {
  style: React.CSSProperties
  data?: any
} & React.PropsWithChildren &
  Pick<
    React.CSSProperties,
    'left' | 'top' | 'width' | 'height' | 'borderRadius'
  >

export function TreemapSquare({
  children,
  left,
  top,
  width,
  height,
  borderRadius,
  data,
  style,
  ...other
}: TreemapSquareProps) {
  return (
    <div
      data-vals={data.toString() + '...' + width + '...' + height}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        wordBreak: 'break-word',
        flexDirection: 'column',
        ...style,
      }}
      {...other}
    >
      {children}
    </div>
  )
}
