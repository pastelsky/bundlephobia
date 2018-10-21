require('dotenv').config()
const debug = require('debug')('bp:cache')
const axios = require('axios')
const logger = require('../server/Logger')

const API = axios.create({
  baseURL: process.env.CACHE_SERVICE_ENDPOINT,
  timeout: 5000,
});

class Cache {
  async get({ name, version }) {
    debug('get %s@%s', name, version)
    try {
      const result = await API.get('/cache', { params: { name, version } })
      debug('cache hit')
      return result.data
    } catch (err) {
    }
  }

  async set({ name, version }, result) {
    debug('set %O to %O', { name, version }, result)
    try {
      await API.post('/cache', { name, version, result })
    } catch (err) {
      console.error(err.data)
      logger.error('CACHE_SET_ERROR', {
        name,
        version,
        error: err.data
      }, `CACHE ERROR for package ${name}@${version}`)
    }
  }
}

module.exports = Cache
