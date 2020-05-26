require('dotenv-defaults').config()
const debug = require('debug')('bp:cache')
const axios = require('axios')
const logger = require('../server/Logger')

const API = axios.create({
  baseURL: process.env.CACHE_SERVICE_ENDPOINT,
  timeout: 5000,
})

class Cache {
  async getPackageSize({ name, version }) {
    debug('get package %s@%s', name, version)
    try {
      const result = await API.get('/package-cache', {
        params: { name, version },
      })
      debug('cache hit')
      return result.data
    } catch (err) {}
  }

  async setPackageSize({ name, version }, result) {
    debug('set package %O to %O', { name, version }, result)
    try {
      await API.post('/package-cache', { name, version, result })
    } catch (err) {
      console.error(err.data)
      logger.error(
        'CACHE_SET_ERROR',
        {
          name,
          version,
          error: err.data,
        },
        `CACHE ERROR for package ${name}@${version}`
      )
    }
  }

  async getExportsSize({ name, version }) {
    debug('get exports %s@%s', name, version)
    try {
      const result = await API.get('/exports-cache', {
        params: { name, version },
      })
      debug('cache hit')
      return result.data
    } catch (err) {}
  }

  async setExportsSize({ name, version }, result) {
    debug('set exports %O to %O', { name, version }, result)
    try {
      await API.post('/exports-cache', { name, version, result })
    } catch (err) {
      console.error(err.data)
      logger.error(
        'CACHE_SET_ERROR',
        {
          name,
          version,
          error: err.data,
        },
        `CACHE ERROR for package exports ${name}@${version}`
      )
    }
  }
}

module.exports = Cache
