jest.mock('@amplitude/analytics-browser', () => ({
  init: jest.fn(),
  track: jest.fn(),
}))

import Analytics from '../analytics'
import { initializeAmplitude } from '../amplitude'
import * as amplitude from '@amplitude/analytics-browser'

describe('Analytics', () => {
  const init = amplitude.init as jest.Mock
  const track = amplitude.track as jest.Mock

  beforeEach(() => {
    init.mockReset()
    track.mockReset()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('initializes Amplitude only once in the browser', async () => {
    initializeAmplitude()
    Analytics.pageView('scan')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith('93638c7d7bac8785dca060653e104732', {
      autocapture: true,
    })
  })

  it('sends page context through Amplitude', async () => {
    Analytics.pageView('scan')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(track).toHaveBeenCalledWith('page_context_viewed', {
      page_type: 'scan',
    })
  })

  it('preserves typed event data for package searches', async () => {
    Analytics.searchSuccess({ packageName: 'react', timeTaken: 123 })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(track).toHaveBeenCalledWith('search_succeeded', {
      package: 'react',
      timeTaken: 123,
    })
  })

  it('tracks ad impressions and viewed slots without a creative separately', async () => {
    Analytics.advertisementImpression({ placement: 'homepage' })
    Analytics.advertisementUnavailable({
      placement: 'package_result',
      reason: 'creative_timeout',
    })
    await new Promise(resolve => setTimeout(resolve, 0))

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

    expect(() => Analytics.performedScan()).not.toThrow()
  })
})
