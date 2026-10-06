import React from 'react'
import Analytics from '../../analytics'

type CarbonAdProps = {
  className?: string
  placement: 'home' | 'package'
}

const CarbonAd = ({ className, placement }: CarbonAdProps) => {
  const containerRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const container = containerRef.current

    if (!container) return

    let loaded = false
    let failed = false
    let viewable = false
    let visible = false
    let creative: HTMLImageElement | null = null
    let visibilityTimer: ReturnType<typeof setTimeout> | undefined

    const updateVisibility = () => {
      clearTimeout(visibilityTimer)

      if (!visible || document.visibilityState !== 'visible' || viewable) return

      visibilityTimer = setTimeout(() => {
        if (!visible || document.visibilityState !== 'visible') return

        viewable = true
        Analytics.adViewable(placement)
        intersectionObserver?.disconnect()
      }, 1000)
    }

    const intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            entries => {
              visible = entries.some(entry => entry.intersectionRatio >= 0.5)
              updateVisibility()
            },
            { threshold: [0, 0.5] },
          )

    const recordLoaded = () => {
      if (loaded || !creative?.complete || !creative.naturalWidth) return

      loaded = true
      clearTimeout(loadTimer)
      mutationObserver.disconnect()
      Analytics.adLoaded(placement)
      const ad = container.querySelector('#carbonads')

      if (ad) intersectionObserver?.observe(ad)
    }

    const mutationObserver = new MutationObserver(() => {
      const image = container.querySelector<HTMLImageElement>('#carbonads img')

      if (!image || image === creative) return

      creative?.removeEventListener('load', recordLoaded)
      creative = image

      creative.addEventListener('load', recordLoaded)
      recordLoaded()
    })

    const recordFailure = (reason: 'script_error' | 'creative_timeout') => {
      if (loaded || failed) return

      failed = true
      clearTimeout(loadTimer)
      Analytics.adLoadFailed(placement, reason)
    }

    const loadTimer = setTimeout(() => recordFailure('creative_timeout'), 10000)
    mutationObserver.observe(container, { childList: true, subtree: true })
    document.addEventListener('visibilitychange', updateVisibility)
    Analytics.adRequested(placement)

    const script = document.createElement('script')
    script.async = true
    script.type = 'text/javascript'
    script.src =
      '//cdn.carbonads.com/carbon.js?serve=CW7D6K77&placement=bundlephobiacom&format=cover'
    script.id = '_carbonads_js'
    script.onerror = () => recordFailure('script_error')
    container.appendChild(script)

    return () => {
      clearTimeout(loadTimer)
      clearTimeout(visibilityTimer)
      mutationObserver.disconnect()
      intersectionObserver?.disconnect()
      creative?.removeEventListener('load', recordLoaded)
      document.removeEventListener('visibilitychange', updateVisibility)
      script.onerror = null
      container.querySelector('#carbonads')?.remove()
      script.remove()
    }
  }, [placement])

  return (
    <aside
      ref={containerRef}
      className={className}
      aria-label="Advertisement"
    />
  )
}

export default CarbonAd
