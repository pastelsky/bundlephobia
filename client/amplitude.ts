const AMPLITUDE_API_KEY = '93638c7d7bac8785dca060653e104732'

type AmplitudeBrowser = typeof import('@amplitude/analytics-browser')

let amplitudeModule: Promise<AmplitudeBrowser> | undefined

function loadAmplitude() {
  if (typeof window === 'undefined') return undefined

  if (!amplitudeModule) {
    amplitudeModule = import('@amplitude/analytics-browser')
      .then(amplitude => {
        amplitude.init(AMPLITUDE_API_KEY, {
          autocapture: true,
          serverUrl: '/_events',
          enableRequestBodyCompression: true,
        })
        return amplitude
      })
      .catch(error => {
        amplitudeModule = undefined
        throw error
      })
  }

  return amplitudeModule
}

export function initializeAmplitude() {
  loadAmplitude()?.catch(() => undefined)
}

export function trackAmplitudeEvent(
  eventName: string,
  eventData?: Record<string, unknown>,
) {
  loadAmplitude()
    ?.then(amplitude => amplitude.track(eventName, eventData))
    .catch(() => undefined)
}
