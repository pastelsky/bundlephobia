import React from 'react'
import cx from 'classnames'
import { IconButton } from '../ui'
import Analytics from '../../analytics'

const AD_VIEW_DURATION_MS = 1000
const AD_LOAD_TIMEOUT_MS = 5000

type AdPlacement = 'homepage' | 'package_result'
type AdLoadState = 'pending' | 'ready' | 'unavailable'
type AdUnavailableReason = 'script_error' | 'creative_timeout'

type CarbonAdProps = {
  className?: string
  placement: AdPlacement
}

const CarbonAd = ({ className, placement }: CarbonAdProps) => {
  const slotRef = React.useRef<HTMLElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = React.useState(true)
  const [adLoadState, setAdLoadState] = React.useState<AdLoadState>('pending')
  const [unavailableReason, setUnavailableReason] =
    React.useState<AdUnavailableReason>('creative_timeout')
  const [slotHasBeenViewed, setSlotHasBeenViewed] = React.useState(false)
  const impressionTracked = React.useRef(false)
  const unavailableTracked = React.useRef(false)

  const hasCreative = adLoadState === 'ready'

  React.useEffect(() => {
    const slot = slotRef.current
    if (!slot || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setSlotHasBeenViewed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )

    observer.observe(slot)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const revealWhenCreativeIsRendered = () => {
      const carbonAds = Array.from(container.querySelectorAll('#carbonads'))
      const [carbonAd, ...duplicateCarbonAds] = carbonAds
      duplicateCarbonAds.forEach(carbonAd => carbonAd.remove())
      const hasAdContent = Boolean(
        carbonAd?.querySelector('a, img, .carbon-text'),
      )

      if (hasAdContent) {
        setAdLoadState('ready')
      }
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
    script.onerror = () => {
      setUnavailableReason('script_error')
      setAdLoadState('unavailable')
    }
    container.appendChild(script)

    const loadTimeout = window.setTimeout(() => {
      setUnavailableReason('creative_timeout')
      setAdLoadState(currentState =>
        currentState === 'pending' ? 'unavailable' : currentState,
      )
    }, AD_LOAD_TIMEOUT_MS)

    return () => {
      observer.disconnect()
      window.clearTimeout(loadTimeout)
      container
        .querySelectorAll('#carbonads')
        .forEach(carbonAd => carbonAd.remove())
      script.remove()
    }
  }, [])

  React.useEffect(() => {
    if (
      adLoadState !== 'unavailable' ||
      !slotHasBeenViewed ||
      unavailableTracked.current
    ) {
      return
    }

    unavailableTracked.current = true
    Analytics.advertisementUnavailable({ placement, reason: unavailableReason })
  }, [adLoadState, placement, slotHasBeenViewed, unavailableReason])

  React.useEffect(() => {
    if (!hasCreative || impressionTracked.current) return

    const carbonAd = containerRef.current?.querySelector('#carbonads')
    if (!carbonAd || !('IntersectionObserver' in window)) return

    let viewTimeout: number | undefined
    const observer = new IntersectionObserver(
      entries => {
        const isInView = entries.some(entry => entry.isIntersecting)

        if (isInView && viewTimeout === undefined) {
          viewTimeout = window.setTimeout(() => {
            impressionTracked.current = true
            Analytics.advertisementImpression({ placement })
            observer.disconnect()
          }, AD_VIEW_DURATION_MS)
        }

        if (!isInView && viewTimeout !== undefined) {
          window.clearTimeout(viewTimeout)
          viewTimeout = undefined
        }
      },
      { threshold: 0.5 },
    )

    observer.observe(carbonAd)
    return () => {
      observer.disconnect()
      if (viewTimeout !== undefined) window.clearTimeout(viewTimeout)
    }
  }, [hasCreative, placement])

  if (!isVisible) return null

  return (
    <aside
      ref={slotRef}
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
