function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export default function serializeError(error) {
  if (
    error &&
    typeof error === 'object' &&
    typeof error.toJSON === 'function'
  ) {
    const serialized = error.toJSON()
    if (
      serialized &&
      typeof serialized === 'object' &&
      typeof serialized.name === 'string'
    ) {
      return serialized
    }
  }

  return {
    name: 'BuildServiceError',
    originalError: {
      message: getErrorMessage(error),
      ...(typeof error?.code === 'string' ? { code: error.code } : {}),
    },
    extra: { retryable: true },
  }
}
