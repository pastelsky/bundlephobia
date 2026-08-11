import 'dotenv-defaults/config'

import axios from 'axios'
import createDebug from 'debug'

import type { TrendsCacheName } from '../../types/cache-domain'
import logger from '../Logger'

const debug = createDebug('bp:cache')

export interface CacheKey {
  name: string
  version: string
}

const API = axios.create({
  baseURL: process.env.CACHE_SERVICE_ENDPOINT,
  timeout: 5000,
})

function getAxiosErrorData(error: unknown): unknown {
  return axios.isAxiosError(error) ? error.response?.data : undefined
}

export default class CacheServiceClient {
  async getPackageSize<T>(key: CacheKey): Promise<T | undefined> {
    try {
      const result = await API.get<T>('/package-cache', { params: key })
      return result.data
    } catch (error) {
      console.error(
        axios.isAxiosError(error) ? error.response?.statusText : undefined,
      )
      return undefined
    }
  }

  async setPackageSize<T>(key: CacheKey, result: T): Promise<void> {
    debug('set package %O to %O', key, result)
    try {
      await API.post('/package-cache', { ...key, result })
    } catch (error) {
      this.logSetError(
        key,
        error,
        `CACHE ERROR for package ${key.name}@${key.version}`,
      )
    }
  }

  async getExportsSize<T>(key: CacheKey): Promise<T | undefined> {
    debug('get exports %s@%s', key.name, key.version)
    try {
      const result = await API.get<T>('/exports-cache', { params: key })
      debug('cache hit')
      return result.data
    } catch {
      return undefined
    }
  }

  async setExportsSize<T>(key: CacheKey, result: T): Promise<void> {
    debug('set exports %O to %O', key, result)
    try {
      await API.post('/exports-cache', { ...key, result })
    } catch (error) {
      this.logSetError(
        key,
        error,
        `CACHE ERROR for package exports ${key.name}@${key.version}`,
      )
    }
  }

  getDownloads<T>(key: string): Promise<T | undefined> {
    return this.getTrendsData('downloads', key)
  }

  getGithubHistory<T>(key: string): Promise<T | undefined> {
    return this.getTrendsData('github-history', key)
  }

  getReleases<T>(key: string): Promise<T | undefined> {
    return this.getTrendsData('releases', key)
  }

  getSizeHistory<T>(key: string): Promise<T | undefined> {
    return this.getTrendsData('size-history', key)
  }

  setDownloads<T>(key: string, result: T): Promise<void> {
    return this.setTrendsData('downloads', key, result)
  }

  setGithubHistory<T>(key: string, result: T): Promise<void> {
    return this.setTrendsData('github-history', key, result)
  }

  setReleases<T>(key: string, result: T): Promise<void> {
    return this.setTrendsData('releases', key, result)
  }

  setSizeHistory<T>(key: string, result: T): Promise<void> {
    return this.setTrendsData('size-history', key, result)
  }

  private async getTrendsData<T>(
    cacheName: TrendsCacheName,
    key: string,
  ): Promise<T | undefined> {
    try {
      const result = await API.get<T>(`/trends-cache/${cacheName}`, {
        params: key,
      })
      return result.data
    } catch {
      return undefined
    }
  }

  private async setTrendsData<T>(
    cacheName: TrendsCacheName,
    key: string,
    result: T,
  ): Promise<void> {
    try {
      await API.post(`/trends-cache/${cacheName}`, {
        key,
        result,
      })
    } catch (error) {
      debug('failed to set trends cache %s: %O', key, error)
    }
  }

  private logSetError(key: CacheKey, error: unknown, message: string): void {
    const errorData = getAxiosErrorData(error)
    console.error(errorData)
    logger.error('CACHE_SET_ERROR', { ...key, error: errorData }, message)
  }
}
