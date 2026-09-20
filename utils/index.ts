import { configure } from 'safe-stable-stringify'
import truncate from 'truncate'

type ErrorValue =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  | object

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

const MAX_ERROR_DETAIL_LENGTH = 12_000

const stringifyError = configure({ maximumBreadth: 20, maximumDepth: 4 })

function formatArrayError(originalError: unknown[]): string | null {
  const details = originalError.flatMap(error => {
    const detail = toErrorDetail(error)

    return detail === null ? [] : [detail]
  })

  return details.length
    ? truncate(details.join('\n\n'), MAX_ERROR_DETAIL_LENGTH)
    : null
}

function formatObjectError<T extends object>(originalError: T): string | null {
  const serialized = stringifyError(originalError, null, 2)

  return serialized ? truncate(serialized, MAX_ERROR_DETAIL_LENGTH) : null
}

function formatStringError(originalError: string): string | null {
  return originalError.trim()
    ? truncate(originalError, MAX_ERROR_DETAIL_LENGTH)
    : null
}

function formatNativeError(originalError: Error): string | null {
  return originalError.message
    ? truncate(originalError.message, MAX_ERROR_DETAIL_LENGTH)
    : null
}

function isStringValue<T>(value: T): value is Extract<T, string> {
  return (
    Object(value) !== value &&
    Object.prototype.toString.call(value) === '[object String]'
  )
}

function isObjectValue<T>(value: T): value is Extract<T, object> {
  return (
    value !== null &&
    Object(value) === value &&
    Object.prototype.toString.call(value) !== '[object Function]'
  )
}

export function toErrorDetail<T>(originalError: T): string | null {
  if (originalError === null || originalError === undefined) return null

  if (isStringValue(originalError)) return formatStringError(originalError)

  if (originalError instanceof Error) return formatNativeError(originalError)

  if (Array.isArray(originalError)) return formatArrayError(originalError)

  if (isObjectValue(originalError)) return formatObjectError(originalError)

  return truncate(String(originalError), MAX_ERROR_DETAIL_LENGTH)
}

function isBuildErrorResponse<T>(value: T): value is T & BuildErrorResponse {
  return isObjectValue(value)
}

export function resolveBuildError<T>(resultsError?: T) {
  if (!isBuildErrorResponse(resultsError)) {
    return {
      errorName: null,
      errorBody: null,
      errorDetails: null,
    }
  }

  const error = resultsError.error

  return {
    errorName: error?.code ?? 'InternalServerError',
    errorBody: error?.message ?? 'Something went wrong!',
    errorDetails: toErrorDetail(error?.details?.originalError),
  }
}
