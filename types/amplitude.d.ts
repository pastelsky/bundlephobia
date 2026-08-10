// Amplitude is loaded asynchronously by the client-only bootstrap in _document.
declare global {
  var amplitude: {
    getInstance: () => {
      logEvent: (event: string, data?: Record<string, unknown>) => void
    }
  }
}

export {}
