import {
  eventQueue,
  getAllPackageExports,
  getPackageExportSizes,
  getPackageStats,
} from 'package-build-stats'
import serializeError from './serializeError.js'

const operations = {
  exports: getAllPackageExports,
  exportSizes: getPackageExportSizes,
  size: getPackageStats,
}

const abortController = new AbortController()

function cancelBuild() {
  abortController.abort()
}

process.once('SIGTERM', cancelBuild)
process.on('message', message => {
  if (message?.type === 'cancel') {
    cancelBuild()
  }
})

eventQueue.on('*', (event, details) => {
  process.send?.({ type: 'telemetry', event, details })
})

process.once('message', async message => {
  if (message?.type !== 'run') {
    return
  }

  const operation = operations[message.operation]
  if (!operation) {
    process.send?.({
      type: 'error',
      error: serializeError(
        new Error(`Unknown build operation: ${message.operation}`)
      ),
    })
    process.disconnect?.()
    return
  }

  try {
    const result = await operation(message.packageString, {
      installTimeout: 60000,
      signal: abortController.signal,
    })
    process.send?.({ type: 'result', result })
  } catch (error) {
    process.send?.({ type: 'error', error: serializeError(error) })
  } finally {
    process.disconnect?.()
  }
})
