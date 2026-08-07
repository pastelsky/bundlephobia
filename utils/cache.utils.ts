import 'dotenv-defaults/config'

import axios, { AxiosError } from 'axios'
import createDebug from 'debug'

import logger from '../server/Logger'
import type { LanguageId } from '../types/language-domain'
import { getLanguageStorageNamespace } from '../storage/language-storage'

const debug = createDebug('bp:cache')

export interface CacheKey {
  language?: LanguageId
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
    const language = key.language ?? 'javascript'
    if (!getLanguageStorageNamespace(language).enabled) return undefined
    try {
      const result = await API.get<T>('/package-cache', {
        params: { name: key.name, version: key.version },
      })
      return result.data
    } catch (error) {
      const axiosError = error as AxiosError
      console.error(axiosError.response?.statusText)
      return undefined
    }
  }

  async setPackageSize<T>(key: CacheKey, result: T): Promise<void> {
    const language = key.language ?? 'javascript'
    if (!getLanguageStorageNamespace(language).writesEnabled) return
    debug('set package %O to %O', key, result)
    try {
      await API.post('/package-cache', {
        name: key.name,
        version: key.version,
        result,
      })
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
    const language = key.language ?? 'javascript'
    if (!getLanguageStorageNamespace(language).enabled) return undefined
    debug('get exports %s@%s', key.name, key.version)
    try {
      const result = await API.get<T>('/exports-cache', {
        params: { name: key.name, version: key.version },
      })
      debug('cache hit')
      return result.data
    } catch {
      return undefined
    }
  }

  async setExportsSize<T>(key: CacheKey, result: T): Promise<void> {
    const language = key.language ?? 'javascript'
    if (!getLanguageStorageNamespace(language).writesEnabled) return
    debug('set exports %O to %O', key, result)
    try {
      await API.post('/exports-cache', {
        name: key.name,
        version: key.version,
        result,
      })
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
