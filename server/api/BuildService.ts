import axios from 'axios'
import createDebug from 'debug'

import CustomError from '../CustomError'
import { JobCancelledError } from '../Queue'
import config from '../config'
import { pool, requestQueue } from '../init'

const debug = createDebug('bp:build')
export const MAX_BUILD_SERVICE_RESPONSE_BYTES = 8 * 1024 * 1024

const OperationType = {
  PACKAGE_BUILD_STATS: 'PACKAGE_BUILD_STATS',
  PACKAGE_EXPORTS: 'PACKAGE_EXPORTS',
  PACKAGE_EXPORTS_SIZES: 'PACKAGE_EXPORTS_SIZES',
} as const

type OperationType = (typeof OperationType)[keyof typeof OperationType]

interface BuildServiceJobParams {
  packageString: string
  onComplete?: (durationMs: number) => void
}

interface BuildRequestOptions {
  signal?: AbortSignal
  onComplete?: (durationMs: number) => void
}

export const BUILD_DURATION_HEADER = 'x-bundlephobia-build-duration-ms'

interface BuildServerErrorPayload {
  name?: string
  originalError?: unknown
  extra?: unknown
}

export default class BuildService {
  constructor() {
    const operations = [
      {
        type: OperationType.PACKAGE_BUILD_STATS,
        endpoint: '/size',
        methodName: 'getPackageStats',
      },
      {
        type: OperationType.PACKAGE_EXPORTS,
        endpoint: '/exports',
        methodName: 'getPackageExports',
      },
      {
        type: OperationType.PACKAGE_EXPORTS_SIZES,
        endpoint: '/exports-sizes',
        methodName: 'getPackageExportSizes',
      },
    ] as const

    operations.forEach(operation => {
      requestQueue.addExecutor<BuildServiceJobParams, unknown>(
        operation.type,
        async ({ packageString, onComplete }, { signal }) => {
          const startedAt = performance.now()
          if (process.env.BUILD_SERVICE_ENDPOINT) {
            try {
              const response = await axios.get(
                `${process.env.BUILD_SERVICE_ENDPOINT}${
                  operation.endpoint
                }?p=${encodeURIComponent(packageString)}`,
                {
                  signal,
                  maxContentLength: MAX_BUILD_SERVICE_RESPONSE_BYTES,
                }
              )
              return response.data
            } catch (error) {
              if (axios.isCancel(error)) {
                throw new JobCancelledError()
              }
              this.handleError(error, operation.type)
            } finally {
              onComplete?.(
                Math.max(1, Math.ceil(performance.now() - startedAt))
              )
            }
          }

          const execution = pool
            .exec(operation.methodName, [packageString])
            .timeout(config.WORKER_TIMEOUT)
          const cancelExecution = () => execution.cancel?.()
          signal.addEventListener('abort', cancelExecution, { once: true })
          try {
            return await execution
          } finally {
            onComplete?.(Math.max(1, Math.ceil(performance.now() - startedAt)))
            signal.removeEventListener('abort', cancelExecution)
          }
        }
      )
    })
  }

  private handleError(error: unknown, operationType: OperationType): never {
    if (axios.isAxiosError(error) && error.response) {
      const contents = error.response.data as BuildServerErrorPayload
      throw new CustomError(
        contents.name || 'BuildError',
        contents.originalError,
        contents.extra
      )
    }

    if (axios.isAxiosError(error) && error.request) {
      debug('No response received from build server. Is the server down?')
      throw new CustomError(
        'BuildServiceUnavailableError',
        {
          operation: operationType,
          reason: 'BUILD_SERVICE_UNREACHABLE',
          url: (error.request as { _currentUrl?: string })._currentUrl,
        },
        undefined
      )
    }

    throw new CustomError(
      'BuildError',
      error instanceof Error ? error.message : String(error),
      {
        operation: operationType,
      }
    )
  }

  async getPackageBuildStats<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {}
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_BUILD_STATS,
      {
        packageString,
        onComplete: options.onComplete,
      },
      { priority, signal: options.signal }
    )
  }

  async getPackageExports<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {}
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_EXPORTS,
      {
        packageString,
        onComplete: options.onComplete,
      },
      { priority, signal: options.signal }
    )
  }

  async getPackageExportSizes<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {}
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_EXPORTS_SIZES,
      {
        packageString,
        onComplete: options.onComplete,
      },
      { priority, signal: options.signal }
    )
  }
}
