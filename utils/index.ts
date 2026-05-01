export interface FormattedValue {
  unit: 'B' | 'kB' | 'MB' | 'μs' | 'ms' | 's'
  size: number
}

export interface BuildErrorResponse {
  error?: {
    code?: string
    message?: string
    details?: {
      originalError?: unknown
    }
  }
}

export function encodeFirebaseKey(key: string): string {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}

export function decodeFirebaseKey(key: string): string {
  return key.replace(/[,]/g, '.').replace(/__/g, '/')
}

export const formatSize = (value: number): FormattedValue => {
  let unit: FormattedValue['unit']
  let size: number

  if (Math.log10(value) < 3) {
    unit = 'B'
    size = value
  } else if (Math.log10(value) < 6) {
    unit = 'kB'
    size = value / 1024
  } else {
    unit = 'MB'
    size = value / 1024 / 1024
  }

  return { unit, size }
}

export const formatTime = (value: number): FormattedValue => {
  let unit: FormattedValue['unit']
  let size: number

  if (value < 0.0005) {
    unit = 'μs'
    size = Math.round(value * 1_000_000)
  } else if (value < 0.5) {
    unit = 'ms'
    size = Math.round(value * 1000)
  } else {
    unit = 's'
    size = value
  }

  return { unit, size }
}

export const DownloadSpeed = {
  THREE_G: 400 / 8,
  FOUR_G: 7000 / 8,
} as const

export function getTimeFromSize(sizeInBytes: number) {
  return {
    threeG: sizeInBytes / 1024 / DownloadSpeed.THREE_G,
    fourG: sizeInBytes / 1024 / DownloadSpeed.FOUR_G,
  }
}

export function randomFromArray<T>(arr: readonly T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function zeroToN(n: number): number[] {
  return Array.from(Array(n).keys())
}

function toErrorDetail(originalError: unknown): string | null {
  if (Array.isArray(originalError)) {
    return originalError[0] == null ? null : String(originalError[0])
  }

  return originalError == null ? null : String(originalError)
}

function isBuildErrorResponse(value: unknown): value is BuildErrorResponse {
  return typeof value === 'object' && value !== null
}

export function resolveBuildError(resultsError?: unknown) {
  if (!resultsError || !isBuildErrorResponse(resultsError)) {
    return {
      errorName: null,
      errorBody: null,
      errorDetails: null,
    }
  }

  return {
    errorName: resultsError.error?.code ?? 'InternalServerError',
    errorBody: resultsError.error?.message ?? 'Something went wrong!',
    errorDetails: toErrorDetail(resultsError.error?.details?.originalError),
  }
}
