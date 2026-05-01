import axios from 'axios'
import createDebug from 'debug'

import CustomError from '../CustomError'
import config from '../config'
import { pool, requestQueue } from '../init'

const debug = createDebug('bp:build')

const OperationType = {
  PACKAGE_BUILD_STATS: 'PACKAGE_BUILD_STATS',
  PACKAGE_EXPORTS: 'PACKAGE_EXPORTS',
  PACKAGE_EXPORTS_SIZES: 'PACKAGE_EXPORTS_SIZES',
} as const

type OperationType = (typeof OperationType)[keyof typeof OperationType]

interface BuildServiceJobParams {
  packageString: string
}

interface BuildServerErrorPayload {
  name?: string
  originalError?: unknown
  extra?: unknown
}

interface PoolLike {
  exec(
    method: string,
    params: unknown[]
  ): { timeout(ms: number): Promise<unknown> }
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
        methodName: 'getAllPackageExports',
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
        async ({ packageString }) => {
          if (process.env.BUILD_SERVICE_ENDPOINT) {
            try {
              const response = await axios.get(
                `${process.env.BUILD_SERVICE_ENDPOINT}${
                  operation.endpoint
                }?p=${encodeURIComponent(packageString)}`
              )
              return response.data
            } catch (error) {
              this.handleError(error, operation.type)
            }
          }

          return (pool as PoolLike)
            .exec(operation.methodName, [packageString])
            .timeout(config.WORKER_TIMEOUT)
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
        'BuildError',
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
    priority: number
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_BUILD_STATS,
      { packageString },
      { priority }
    )
  }

  async getPackageExports<T>(
    packageString: string,
    priority: number
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_EXPORTS,
      { packageString },
      { priority }
    )
  }

  async getPackageExportSizes<T>(
    packageString: string,
    priority: number
  ): Promise<T> {
    return requestQueue.process<T, BuildServiceJobParams>(
      packageString,
      OperationType.PACKAGE_EXPORTS_SIZES,
      { packageString },
      { priority }
    )
  }
}
