declare global {
  type UmamiEventData = Record<string, string | number | boolean>

  interface Window {
    umami?: {
      track: (eventName: string, eventData?: UmamiEventData) => void
      identify: (data: Record<string, unknown>) => void
    }
  }
}

export {}
