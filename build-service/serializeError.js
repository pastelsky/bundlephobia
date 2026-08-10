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
      return {
        name: item.name,
        message: item.message,
        ...(typeof item.code === 'string' ? { code: item.code } : {}),
      }
    }
    return typeof item === 'string'
      ? truncate(item, MAX_ERROR_MESSAGE_LENGTH)
      : item
  })

  return serialized === undefined ? undefined : JSON.parse(serialized)
}

export default function serializeError(error) {
  if (
    error &&
    typeof error === 'object' &&
    typeof error.toJSON === 'function'
  ) {
    const serialized = serializeValue(error)
    if (serialized && typeof serialized.name === 'string') {
      return serialized
    }
  }

  return {
    name: 'BuildServiceError',
    originalError: {
      message: truncate(
        error instanceof Error ? error.message : String(error),
        MAX_ERROR_MESSAGE_LENGTH,
      ),
      ...(typeof error?.code === 'string' ? { code: error.code } : {}),
    },
    extra: { retryable: true },
  }
}
