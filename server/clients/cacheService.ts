import 'dotenv-defaults/config'

import axios, { type AxiosInstance } from 'axios'
import createDebug from 'debug'

import {
  CACHE_ROUTE,
  parseExportsCacheResult,
  parsePackageCacheResult,
  type CacheKey,
  type CacheReadResult,
  type CacheValue,
  type ExportsCacheResult,
  type PackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

import logger from '../Logger'

const debug = createDebug('bp:cache')

export type { CacheKey } from '@bundlephobia/service-contracts/cache'

export interface CacheServiceClientOptions {
  api?: Pick<AxiosInstance, 'get' | 'post'>
  endpoint?: string
  timeoutMs?: number
}

function errorPayload(error: Error) {
  return { name: error.name, message: error.message }
}

export default class CacheServiceClient {
  private readonly api: Pick<AxiosInstance, 'get' | 'post'>

  constructor(options: CacheServiceClientOptions = {}) {
    this.api =
      options.api ??
      axios.create({
        baseURL: options.endpoint ?? process.env.CACHE_SERVICE_ENDPOINT,
        timeout: options.timeoutMs ?? 5000,
      })
  }

  async getPackageSize(
    key: CacheKey,
  ): Promise<CacheReadResult<PackageCacheResult>> {
    return this.read({
      route: CACHE_ROUTE.package,
      key,
      parse: parsePackageCacheResult,
      label: 'package',
    })
  }

  async setPackageSize(
    key: CacheKey,
    result: PackageCacheResult,
  ): Promise<void> {
    await this.write({
      route: CACHE_ROUTE.package,
      key,
      result,
      label: 'package',
    })
  }

  async getExportsSize(
    key: CacheKey,
  ): Promise<CacheReadResult<ExportsCacheResult>> {
    return this.read({
      route: CACHE_ROUTE.exports,
      key,
      parse: parseExportsCacheResult,
      label: 'exports',
    })
  }

  async setExportsSize(
    key: CacheKey,
    result: ExportsCacheResult,
  ): Promise<void> {
    await this.write({
      route: CACHE_ROUTE.exports,
      key,
      result,
      label: 'exports',
    })
  }

  private async read<T>(options: {
    route: string
    key: CacheKey
    parse: (value: CacheValue) => T | null
    label: string
  }): Promise<CacheReadResult<T>> {
    const { route, key, parse, label } = options

    try {
      const response = await this.api.get<CacheValue>(route, { params: key })

      const value = parse(response.data)

      if (value === null) {
        const error = new Error(`Invalid ${label} cache response`)
        this.logReadError(key, error, label)

        return { status: 'invalid', error }
      }

      debug('cache hit: %s %s@%s', label, key.name, key.version)

      return { status: 'hit', value }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        debug('cache miss: %s %s@%s', label, key.name, key.version)

        return { status: 'miss' }
      }

      const normalizedError =
        error instanceof Error ? error : new Error(String(error))

      this.logReadError(key, normalizedError, label)

      return { status: 'unavailable', error: normalizedError }
    }
  }

  private async write<
    T extends PackageCacheResult | ExportsCacheResult,
  >(options: {
    route: string
    key: CacheKey
    result: T
    label: string
  }): Promise<void> {
    const { route, key, result, label } = options

    try {
      await this.api.post(route, { ...key, result })
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error))

      logger.error(
        'CACHE_WRITE_ERROR',
        { ...key, ...errorPayload(normalizedError) },
        `CACHE WRITE FAILED: ${label}`,
      )
    }
  }

  private logReadError(key: CacheKey, error: Error, label: string): void {
    logger.error(
      'CACHE_READ_ERROR',
      { ...key, ...errorPayload(error) },
      `CACHE READ FAILED: ${label}`,
    )
  }
}
