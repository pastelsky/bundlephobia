import React from 'react'

type CarbonAdProps = {
  className?: string
}

const CarbonAd = ({ className }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=cover'
    script.id = '_carbonads_js'
    container.appendChild(script)

    return () => {
      container.querySelector('#carbonads')?.remove()
      script.remove()
    }
  }, [])

  return (
    <aside
      ref={containerRef}
      className={className}
      aria-label="Advertisement"
    />
  )
}

export default CarbonAd
