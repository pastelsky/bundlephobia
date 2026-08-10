import React from 'react'
import cx from 'classnames'
import { IconButton } from '../ui'

type CarbonAdProps = {
  className?: string
}

const CarbonAd = ({ className }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = React.useState(true)
  const [hasCreative, setHasCreative] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const revealWhenCreativeIsRendered = () => {
      const carbonAds = Array.from(container.querySelectorAll('#carbonads'))
      const [carbonAd, ...duplicateCarbonAds] = carbonAds
      duplicateCarbonAds.forEach(carbonAd => carbonAd.remove())
      const hasAdContent = Boolean(
        carbonAd?.querySelector('a, img, .carbon-text')
      )

      if (hasAdContent) {
        setHasCreative(true)
      }
    }

    const observer = new MutationObserver(revealWhenCreativeIsRendered)
    observer.observe(container, { childList: true, subtree: true })

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=responsive'
    script.id = '_carbonads_js'
    script.onload = () => {
      window.requestAnimationFrame(revealWhenCreativeIsRendered)
    }
    container.appendChild(script)

    return () => {
      observer.disconnect()
      container
        .querySelectorAll('#carbonads')
        .forEach(carbonAd => carbonAd.remove())
      script.remove()
    }
  }, [])

  if (!isVisible) return null

  return (
    <aside
      className={cx('carbon-ad', className, {
        'carbon-ad--ready': hasCreative,
      })}
      aria-label={hasCreative ? 'Advertisement' : undefined}
    >
      <div ref={containerRef} className="carbon-ad__content">
        {hasCreative && (
          <IconButton
            className="carbon-ad__dismiss"
            label="Dismiss advertisement"
            size="sm"
            onClick={() => setIsVisible(false)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        )}
      </div>
    </aside>
  )
}

export default CarbonAd
