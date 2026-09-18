import { configure } from 'safe-stable-stringify'
import truncate from 'truncate'

const MAX_ERROR_MESSAGE_LENGTH = 16_000

const stringifyError = configure({
  deterministic: false,
  maximumBreadth: 20,
  maximumDepth: 4,
})

function serializeValue(value) {
  const serialized = stringifyError(value, (_key, item) => {
    if (item instanceof Error) {
      const serializedError = {
        name: item.name,
        message: item.message,
      }

      if (Object.prototype.toString.call(item.code) === '[object String]') {
        serializedError.code = item.code
      }

      return serializedError
    }

    return Object.prototype.toString.call(item) === '[object String]'
      ? truncate(item, MAX_ERROR_MESSAGE_LENGTH)
      : item
  })

  return serialized === undefined ? undefined : JSON.parse(serialized)
}

function serializeJsonError(error) {
  if (
    error &&
    Object.prototype.toString.call(error) === '[object Object]' &&
    error.toJSON instanceof Function
  ) {
    const serialized = serializeValue(error)

    if (
      serialized &&
      Object.prototype.toString.call(serialized.name) === '[object String]'
    ) {
      return serialized
    }
  }

  return undefined
}

function serializeFallbackError(error) {
  const originalError = {
    message: truncate(
      error instanceof Error ? error.message : String(error),
      MAX_ERROR_MESSAGE_LENGTH,
    ),
  }

  if (Object.prototype.toString.call(error?.code) === '[object String]') {
    originalError.code = error.code
  }

  return {
    name: 'BuildServiceError',
    originalError,
    extra: { retryable: true },
  }
}

export default function serializeError(error) {
  return serializeJsonError(error) || serializeFallbackError(error)
}
