import React from 'react'

type CarbonAdProps = {
  className?: string
}

const CarbonAd = ({ className }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const container = containerRef.current

    if (!container) return

    const removeDuplicateAds = () => {
      const carbonAds = Array.from(container.querySelectorAll('#carbonads'))

      const carbonAdToKeep =
        carbonAds.find(carbonAd =>
          carbonAd.querySelector('a, img, .carbon-text'),
        ) ?? carbonAds[0]

      carbonAds
        .filter(carbonAd => carbonAd !== carbonAdToKeep)
        .forEach(carbonAd => carbonAd.remove())
    }

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=cover'
    script.id = '_carbonads_js'
    script.onload = () => {
      window.requestAnimationFrame(removeDuplicateAds)
    }

    container.appendChild(script)

    return () => {
      container.querySelectorAll('#carbonads').forEach(carbonAd => {
        carbonAd.remove()
      })
      script.remove()
    }
  }, [])

  return <aside ref={containerRef} className={className} />
}

export default CarbonAd
