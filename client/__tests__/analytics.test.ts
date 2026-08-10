import Analytics from '../analytics'

describe('Analytics', () => {
  const track = jest.fn()

  beforeEach(() => {
    track.mockReset()
    globalThis.amplitude = {
      getInstance: () => ({ logEvent: track }),
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        amplitude: {
          getInstance: () => ({ logEvent: track }),
        },
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'amplitude')
  })

  it('sends page context through Amplitude', () => {
    Analytics.pageView('scan')

    expect(track).toHaveBeenCalledWith('page_context_viewed', {
      page_type: 'scan',
    })
  })

  it('preserves typed event data for package searches', () => {
    Analytics.searchSuccess({ packageName: 'react', timeTaken: 123 })

    expect(track).toHaveBeenCalledWith('search_succeeded', {
      package: 'react',
      timeTaken: 123,
    })
  })

  it('tracks ad impressions and viewed slots without a creative separately', () => {
    Analytics.advertisementImpression({ placement: 'homepage' })
    Analytics.advertisementUnavailable({
      placement: 'package_result',
      reason: 'creative_timeout',
    })

    expect(track).toHaveBeenNthCalledWith(1, 'advertisement_impression', {
      placement: 'homepage',
    })
    expect(track).toHaveBeenNthCalledWith(2, 'advertisement_unavailable', {
      placement: 'package_result',
      reason: 'creative_timeout',
    })
  })

  it('does not throw when the browser tracker is unavailable', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })
    Reflect.deleteProperty(globalThis, 'amplitude')

    expect(() => Analytics.performedScan()).not.toThrow()
  })
})
