import React from 'react'
import cx from 'classnames'

type CarbonAdProps = {
  className?: string
}

const CarbonAd = ({ className }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = React.useState(true)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=responsive'
    script.id = '_carbonads_js'
    container.appendChild(script)

    return () => {
      container.querySelector('#carbonads')?.remove()
      script.remove()
    }
  }, [])

  if (!isVisible) return null

  return (
    <aside className={cx('carbon-ad', className)} aria-label="Advertisement">
      <div ref={containerRef} className="carbon-ad__content">
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
      </div>
    </aside>
  )
}

export default CarbonAd
