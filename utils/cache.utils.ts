import 'dotenv-defaults/config'

import axios, { AxiosError } from 'axios'
import createDebug from 'debug'

import logger from '../server/Logger'

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

export default class Cache {
  async getPackageSize<T>(key: CacheKey): Promise<T | undefined> {
    try {
      const result = await API.get<T>('/package-cache', {
        params: key,
      })
      return result.data
    } catch (error) {
      const axiosError = error as AxiosError
      console.error(axiosError.response?.statusText)
      return undefined
    }
  }

  async setPackageSize<T>(key: CacheKey, result: T): Promise<void> {
    debug('set package %O to %O', key, result)
    try {
      await API.post('/package-cache', { ...key, result })
    } catch (error) {
      const errorData = getAxiosErrorData(error)
      console.error(errorData)
      logger.error(
        'CACHE_SET_ERROR',
        {
          ...key,
          error: errorData,
        },
        `CACHE ERROR for package ${key.name}@${key.version}`
      )
    }
  }

  async getExportsSize<T>(key: CacheKey): Promise<T | undefined> {
    debug('get exports %s@%s', key.name, key.version)
    try {
      const result = await API.get<T>('/exports-cache', {
        params: key,
      })
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
      const errorData = getAxiosErrorData(error)
      console.error(errorData)
      logger.error(
        'CACHE_SET_ERROR',
        {
          ...key,
          error: errorData,
        },
        `CACHE ERROR for package exports ${key.name}@${key.version}`
      )
    }
  }
}
