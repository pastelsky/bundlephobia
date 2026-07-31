import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const workerPath = fileURLToPath(new URL('./buildWorker.js', import.meta.url))
const forceKillDelay = 2000

export class BuildOperationCancelledError extends Error {
  constructor() {
    super('Package build was cancelled')
    this.name = 'BuildOperationCancelledError'
    this.code = 'BUILD_CANCELLED'
  }
}

class RemoteBuildError extends Error {
  constructor(payload) {
    super(payload?.name || 'Package build failed')
    this.name = payload?.name || 'BuildServiceError'
    this.payload = payload
  }

  toJSON() {
    return this.payload
  }
}

export default function runPackageOperation(
  operation,
  packageString,
  { signal, onTelemetry } = {}
) {
  return new Promise((resolve, reject) => {
    const worker = fork(workerPath, [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    let settled = false
    let forceKillTimer

    const settle = callback => {
      if (settled) {
        return
      }
      settled = true
      signal?.removeEventListener('abort', cancel)
      callback()
    }

    const cancel = () => {
      if (settled) {
        return
      }

      worker.send?.({ type: 'cancel' })
      worker.kill('SIGTERM')
      forceKillTimer = setTimeout(() => worker.kill('SIGKILL'), forceKillDelay)
      forceKillTimer.unref()
      settle(() => reject(new BuildOperationCancelledError()))
    }

    worker.once('spawn', () => {
      if (signal?.aborted) {
        cancel()
        return
      }
      worker.send({ type: 'run', operation, packageString })
    })

    worker.on('message', message => {
      if (message?.type === 'telemetry') {
        onTelemetry?.(message.event, message.details)
      } else if (message?.type === 'result') {
        settle(() => resolve(message.result))
      } else if (message?.type === 'error') {
        settle(() => reject(new RemoteBuildError(message.error)))
      }
    })

    worker.once('error', error => settle(() => reject(error)))
    worker.once('exit', (code, exitSignal) => {
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
      }
      settle(() =>
        reject(
          new Error(
            `Build worker exited before responding (${
              exitSignal || `code ${code}`
            })`
          )
        )
      )
    })

    signal?.addEventListener('abort', cancel, { once: true })
  })
}
