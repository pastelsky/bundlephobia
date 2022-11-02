// stab typings for amplitudeScript loaded in the _document
declare global {
  var amplitude: {
    getInstance: () => {
      logEvent: (event: string, data?: Record<string, unknown>) => void
    }
  }
}

export {}
