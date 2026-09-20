const AMPLITUDE_API_KEY = '93638c7d7bac8785dca060653e104732'

type AmplitudeBrowser = Pick<
  typeof import('@amplitude/analytics-browser'),
  'init' | 'track'
>

type AmplitudeLoader = () => Promise<AmplitudeBrowser>

type AnalyticsValue = string | number | boolean | null | undefined

type AnalyticsEventData = Record<string, AnalyticsValue>

let amplitudeModule: Promise<AmplitudeBrowser> | undefined

let amplitudeLoader: AmplitudeLoader = () =>
  import('@amplitude/analytics-browser')

export function setAmplitudeLoader(loader: AmplitudeLoader): () => void {
  const previousLoader = amplitudeLoader
  const previousModule = amplitudeModule
  amplitudeLoader = loader
  amplitudeModule = undefined

  return () => {
    amplitudeLoader = previousLoader
    amplitudeModule = previousModule
  }
}

function loadAmplitude() {
  if (typeof window === 'undefined') return undefined

  if (!amplitudeModule) {
    amplitudeModule = amplitudeLoader()
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
  eventData?: AnalyticsEventData,
) {
  loadAmplitude()
    ?.then(amplitude => amplitude.track(eventName, eventData))
    .catch(() => undefined)
}
