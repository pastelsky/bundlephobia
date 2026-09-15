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
  endpoint: string
  methodName: string
}

interface BuildServiceJobParams {
  packageString: string
  onComplete?: (durationMs: number) => void
}

interface BuildRequestOptions {
  signal?: AbortSignal
  onComplete?: (durationMs: number) => void
}

interface BuildExecutionOptions {
  operation: OperationDefinition
  packageString: string
  signal: AbortSignal
  onComplete?: (durationMs: number) => void
  startedAt: number
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
            return this.executeRemoteBuild({
              operation,
              packageString,
              signal,
              onComplete,
              startedAt,
            })
          }

          return this.executeLocalBuild({
            operation,
            packageString,
            signal,
            onComplete,
            startedAt,
          })
        },
      )
    })
  }

  private completeBuild(options: BuildExecutionOptions) {
    const durationMs = Math.max(
      1,
      Math.ceil(performance.now() - options.startedAt),
    )
    options.onComplete?.(durationMs)
    logger.timing(
      `analysis.javascript.${options.operation.operation}.duration`,
      durationMs,
    )
  }

  private async executeRemoteBuild({
    operation,
    packageString,
    signal,
    onComplete,
    startedAt,
  }: BuildExecutionOptions) {
    try {
      const response = await axios.get(
        `${process.env.BUILD_SERVICE_ENDPOINT}${operation.endpoint}?p=${encodeURIComponent(packageString)}`,
        { signal, maxContentLength: MAX_BUILD_SERVICE_RESPONSE_BYTES },
      )
      return response.data
    } catch (error) {
      if (axios.isCancel(error)) throw new JobCancelledError()
      this.handleError(error, operation)
    } finally {
      this.completeBuild({
        operation,
        packageString,
        signal,
        onComplete,
        startedAt,
      })
    }
  }

  private async executeLocalBuild({
    operation,
    packageString,
    signal,
    onComplete,
    startedAt,
  }: BuildExecutionOptions) {
    const execution = pool
      .exec(operation.methodName, [packageString])
      .timeout(config.WORKER_TIMEOUT)
    let rejectCancellation: (error: JobCancelledError) => void = () => {}
    const cancellation = new Promise<never>((_, reject) => {
      rejectCancellation = reject
    })
    const cancelExecution = () => {
      // workerpool cancellation terminates its worker and can leave a
      // subsequent job waiting indefinitely. Let this non-interruptible
      // worker finish while promptly detaching the aborted HTTP request.
      rejectCancellation(new JobCancelledError())
    }
    signal.addEventListener('abort', cancelExecution, { once: true })
    if (signal.aborted) cancelExecution()
    try {
      return await Promise.race([execution, cancellation])
    } catch (error) {
      if (signal.aborted) throw new JobCancelledError()
      throw error
    } finally {
      this.completeBuild({
        operation,
        packageString,
        signal,
        onComplete,
        startedAt,
      })
      signal.removeEventListener('abort', cancelExecution)
    }
  }

  private handleError(error: unknown, operation: OperationDefinition): never {
    if (axios.isAxiosError(error) && error.response) {
      const contents = error.response.data as BuildServerErrorPayload
      throw new CustomError(
        contents.name || 'BuildError',
        contents.originalError,
        contents.extra,
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
        undefined,
      )
    }

    throw new CustomError(
      'BuildError',
      error instanceof Error ? error.message : String(error),
      {
        operation: operation.legacyName,
      },
    )
  }

  async getPackageBuildStats<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {},
  ): Promise<T> {
    logger.increment('analysis.javascript.package-analysis.requested')
    return requestQueue.process<T, BuildServiceJobParams>({
      id: createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_BUILD_STATS.operation,
        packageSpecifier: packageString,
      }),
      type: createQueueType(
        'javascript',
        OperationType.PACKAGE_BUILD_STATS.operation,
      ),
      jobParams: {
        packageString,
        onComplete: options.onComplete,
      },
      options: { priority, signal: options.signal },
    })
  }

  async getPackageExports<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {},
  ): Promise<T> {
    logger.increment('analysis.javascript.package-exports.requested')
    return requestQueue.process<T, BuildServiceJobParams>({
      id: createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_EXPORTS.operation,
        packageSpecifier: packageString,
      }),
      type: createQueueType(
        'javascript',
        OperationType.PACKAGE_EXPORTS.operation,
      ),
      jobParams: {
        packageString,
        onComplete: options.onComplete,
      },
      options: { priority, signal: options.signal },
    })
  }

  async getPackageExportSizes<T>(
    packageString: string,
    priority: number,
    options: BuildRequestOptions = {},
  ): Promise<T> {
    logger.increment('analysis.javascript.package-export-sizes.requested')
    return requestQueue.process<T, BuildServiceJobParams>({
      id: createAnalysisKey({
        language: 'javascript',
        operation: OperationType.PACKAGE_EXPORTS_SIZES.operation,
        packageSpecifier: packageString,
      }),
      type: createQueueType(
        'javascript',
        OperationType.PACKAGE_EXPORTS_SIZES.operation,
      ),
      jobParams: {
        packageString,
        onComplete: options.onComplete,
      },
      options: { priority, signal: options.signal },
    })
  }
}
