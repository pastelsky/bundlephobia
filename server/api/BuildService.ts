import axios from 'axios'
import createDebug from 'debug'

import CustomError from '../CustomError'
import { JobCancelledError } from '../Queue'
import type { AnalysisOperation } from '../analysis/contracts'
import { createAnalysisKey, createQueueType } from '../analysis/keys'
import config from '../config'
import { logger, pool, requestQueue } from '../init'

const debug = createDebug('bp:build')
export const MAX_BUILD_SERVICE_RESPONSE_BYTES = 8 * 1024 * 1024

const OperationType = {
  PACKAGE_BUILD_STATS: {
    legacyName: 'PACKAGE_BUILD_STATS',
    operation: 'package-analysis',
  },
  PACKAGE_EXPORTS: {
    legacyName: 'PACKAGE_EXPORTS',
    operation: 'package-exports',
  },
  PACKAGE_EXPORTS_SIZES: {
    legacyName: 'PACKAGE_EXPORTS_SIZES',
    operation: 'package-export-sizes',
  },
} as const

interface OperationDefinition {
  legacyName: string
  operation: AnalysisOperation
}

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
        ...OperationType.PACKAGE_BUILD_STATS,
        endpoint: '/size',
        methodName: 'getPackageStats',
      },
      {
        ...OperationType.PACKAGE_EXPORTS,
        endpoint: '/exports',
        methodName: 'getAllPackageExports',
      },
      {
        ...OperationType.PACKAGE_EXPORTS_SIZES,
        endpoint: '/exports-sizes',
        methodName: 'getPackageExportSizes',
      },
    ] as const

    operations.forEach(operation => {
      requestQueue.addExecutor<BuildServiceJobParams, unknown>(
        createQueueType('javascript', operation.operation),
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
              this.handleError(error, operation)
            } finally {
              const durationMs = Math.max(
                1,
                Math.ceil(performance.now() - startedAt)
              )
              onComplete?.(durationMs)
              logger.timing(
                `analysis.javascript.${operation.operation}.duration`,
                durationMs
              )
            }
          }

          const execution = pool
            .exec(operation.methodName, [packageString])
            .timeout(config.WORKER_TIMEOUT)
          let rejectCancellation: (error?: unknown) => void = () => {}
          const cancellation = new Promise<never>((_, reject) => {
            rejectCancellation = reject
          })
          const cancelExecution = () => {
            try {
              execution.cancel?.()
            } catch {
              // workerpool throws its cancellation error synchronously
            }
            rejectCancellation(new JobCancelledError())
          }
          signal.addEventListener('abort', cancelExecution, { once: true })
          if (signal.aborted) cancelExecution()
          try {
            return await Promise.race([execution, cancellation])
          } catch (error) {
            if (signal.aborted) {
              throw new JobCancelledError()
            }
            throw error
          } finally {
            const durationMs = Math.max(
              1,
              Math.ceil(performance.now() - startedAt)
            )
            onComplete?.(durationMs)
            logger.timing(
              `analysis.javascript.${operation.operation}.duration`,
              durationMs
            )
            signal.removeEventListener('abort', cancelExecution)
          }
        }
      )
    })
  }

  private handleError(error: unknown, operation: OperationDefinition): never {
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
          operation: operation.legacyName,
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
        operation: operation.legacyName,
      }
    )
  }

  async getPackageBuildStats<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {}
  ): Promise<T> {
    logger.increment('analysis.javascript.package-analysis.requested')
    return requestQueue.process<T, BuildServiceJobParams>(
      createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_BUILD_STATS.operation,
        packageSpecifier: packageString,
      }),
      createQueueType(
        'javascript',
        OperationType.PACKAGE_BUILD_STATS.operation
      ),
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
    logger.increment('analysis.javascript.package-exports.requested')
    return requestQueue.process<T, BuildServiceJobParams>(
      createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_EXPORTS.operation,
        packageSpecifier: packageString,
      }),
      createQueueType('javascript', OperationType.PACKAGE_EXPORTS.operation),
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
    logger.increment('analysis.javascript.package-export-sizes.requested')
    return requestQueue.process<T, BuildServiceJobParams>(
      createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_EXPORTS_SIZES.operation,
        packageSpecifier: packageString,
      }),
      createQueueType(
        'javascript',
        OperationType.PACKAGE_EXPORTS_SIZES.operation
      ),
      {
        packageString,
        onComplete: options.onComplete,
      },
      { priority, signal: options.signal }
    )
  }
}
