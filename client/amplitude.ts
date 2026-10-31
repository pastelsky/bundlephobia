const AMPLITUDE_API_KEY = '93638c7d7bac8785dca060653e104732'

const PAGE_TYPES = new Map([
  ['', 'home'],
  ['package', 'package result'],
  ['trends', 'trends'],
  ['scan', 'scan'],
  ['scan-results', 'scan results'],
  ['blog', 'blog'],
  ['__ui', 'embed'],
])

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
  if (
    typeof window === 'undefined' ||
    process.env.NODE_ENV !== 'production' ||
    !['bundlephobia.com', 'www.bundlephobia.com'].includes(
      window.location.hostname,
    )
  )
    return undefined

  if (!amplitudeModule) {
    amplitudeModule = amplitudeLoader()
      .then(amplitude => {
        amplitude.init(AMPLITUDE_API_KEY, {
          autocapture: {
            attribution: true,
            pageViews: true,
            sessions: true,
            elementInteractions: false,
            formInteractions: false,
            fileDownloads: false,
          },
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
  const amplitude = loadAmplitude()

  if (!amplitude) return

  // Snapshot context before the SDK import resolves; navigation may occur meanwhile.
  const properties = {
    ...eventData,
    page_type:
      PAGE_TYPES.get(window.location.pathname.split('/')[1]) ?? 'other',
    page_domain: window.location.hostname,
    environment: process.env.NODE_ENV,
    tracking_version: 2,
  }

  amplitude
    .then(module => module.track(eventName, properties))
    .catch(() => undefined)
}
