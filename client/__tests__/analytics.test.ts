import Analytics from '../analytics'
import { initializeAmplitude, setAmplitudeLoader } from '../amplitude'

describe('Analytics', () => {
  const init = jest.fn()
  const track = jest.fn()
  let restoreAmplitude: () => void

  // SAFETY: the test module factory replaces the browser init function with a Jest spy.
  const amplitude = { init, track }
  // SAFETY: the test module factory replaces the browser track function with a Jest spy.

  beforeEach(() => {
    init.mockReset()
    track.mockReset()
    restoreAmplitude?.()
    restoreAmplitude = setAmplitudeLoader(async () => amplitude)
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    restoreAmplitude()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('initializes Amplitude only once in the browser', async () => {
    initializeAmplitude()
    Analytics.pageView('scan')
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })

    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith('93638c7d7bac8785dca060653e104732', {
      autocapture: true,
      serverUrl: '/_events',
      enableRequestBodyCompression: true,
    })
  })

  it('sends page context through Amplitude', async () => {
    Analytics.pageView('scan')
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })

    expect(track).toHaveBeenCalledWith('page_context_viewed', {
      page_type: 'scan',
    })
  })

  it('preserves typed event data for package searches', async () => {
    Analytics.searchSuccess({ packageName: 'react', timeTaken: 123 })
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })

    expect(track).toHaveBeenCalledWith('search_succeeded', {
      package: 'react',
      timeTaken: 123,
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
