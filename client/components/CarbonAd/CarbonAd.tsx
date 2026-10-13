import React from 'react'
import cx from 'classnames'

type CarbonAdProps = {
  className?: string
}

const CarbonAd = ({ className }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLElement>(null)
  const [hasCreative, setHasCreative] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current

    if (!container) return

    const revealWhenCreativeIsRendered = () => {
      const carbonAds = Array.from(container.querySelectorAll('#carbonads'))
      const renderedAd = carbonAds.find(carbonAd =>
        carbonAd.querySelector('a, img, .carbon-text'),
      )
      const carbonAdToKeep = renderedAd ?? carbonAds[0]
      carbonAds
        .filter(carbonAd => carbonAd !== carbonAdToKeep)
        .forEach(carbonAd => carbonAd.remove())

      if (renderedAd) setHasCreative(true)
    }

    const observer = new MutationObserver(revealWhenCreativeIsRendered)
    observer.observe(container, { childList: true, subtree: true })

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=cover'
    script.id = '_carbonads_js'
    script.onload = () => {
      window.requestAnimationFrame(revealWhenCreativeIsRendered)
    }
    container.appendChild(script)

    return () => {
      observer.disconnect()
      container.querySelectorAll('#carbonads').forEach(carbonAd => {
        carbonAd.remove()
      })
      script.remove()
    }
  }, [])

  return (
    <aside
      ref={containerRef}
      className={cx(className, { 'carbon-ad--pending': !hasCreative })}
      aria-label={hasCreative ? 'Advertisement' : undefined}
    />
  )
}

export default CarbonAd
