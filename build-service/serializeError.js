function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function getInstallErrorSummary(error) {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  if (typeof error.signal === 'string') {
    return `Package installation was terminated by ${error.signal}.`
  }
  if (typeof error.exitCode === 'number') {
    return `Package manager exited with code ${error.exitCode}.`
  }
  return undefined
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
      if (serialized.name === 'InstallError') {
        return {
          ...serialized,
          originalError: getInstallErrorSummary(error.originalError),
        }
      }
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
