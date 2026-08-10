import React from 'react'
import cx from 'classnames'

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
      const carbonAd = container.querySelector('#carbonads')
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
      container.querySelector('#carbonads')?.remove()
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
          <button
            type="button"
            className="carbon-ad__dismiss"
            aria-label="Dismiss advertisement"
            title="Dismiss advertisement"
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
          </button>
        )}
      </div>
    </aside>
  )
}

export default CarbonAd
