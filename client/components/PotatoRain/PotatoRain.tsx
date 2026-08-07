import React from 'react'
import { createPortal } from 'react-dom'

import Potato from '../../assets/potato.svg'

const MIN_POTATOES = 24
const MAX_POTATOES = 56
const VIEWPORT_PX_PER_POTATO = 46

type FallingPotato = {
  id: number
  left: number
  top: number
  size: number
  delay: number
  duration: number
  drift: number
  spin: number
}

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min)

const getPotatoCount = () => {
  const scaledCount = Math.round(window.innerWidth / VIEWPORT_PX_PER_POTATO)

  return Math.min(MAX_POTATOES, Math.max(MIN_POTATOES, scaledCount))
}

const createPotatoes = (): FallingPotato[] =>
  Array.from({ length: getPotatoCount() }, (_, id) => ({
    id,
    left: randomBetween(-2, 94),
    top: randomBetween(5, 80),
    size: randomBetween(30, 72),
    delay: randomBetween(0, 2.4),
    duration: randomBetween(2.4, 4.4),
    drift: randomBetween(-12, 12),
    spin: randomBetween(-540, 540),
  }))

type PotatoRainProps = {
  onComplete: () => void
}

export const PotatoRain = ({ onComplete }: PotatoRainProps) => {
  const [potatoes] = React.useState(createPotatoes)

  React.useEffect(() => {
    const lastPotatoLandsIn = Math.max(
      ...potatoes.map(potato => potato.delay + potato.duration)
    )
    const timer = window.setTimeout(onComplete, lastPotatoLandsIn * 1000)

    return () => window.clearTimeout(timer)
  }, [potatoes, onComplete])

  return createPortal(
    <div className="potato-rain" aria-hidden="true">
      {potatoes.map(potato => (
        <span
          key={potato.id}
          className="potato-rain__potato"
          style={
            {
              left: `${potato.left}vw`,
              width: `${potato.size}px`,
              animationDelay: `${potato.delay}s`,
              animationDuration: `${potato.duration}s`,
              '--potato-top': `${potato.top}vh`,
              '--potato-drift': `${potato.drift}vw`,
              '--potato-spin': `${potato.spin}deg`,
            } as React.CSSProperties
          }
        >
          <Potato />
        </span>
      ))}
    </div>,
    document.body
  )
}
