require('dotenv').config()
const debug = require('debug')('bp:cache')
const axios = require('axios')
const Logger = require('le_node')

const log = new Logger({
  token: process.env.LOGENTRIES_TOKEN,
});

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
      log.err({
        type: 'ERROR',
        errorType: 'CACHE_ERROR',
        value: err.data,
      })
    }
  }

  async set({ name, version }, result) {
    debug('set %O to %O', { name, version }, result)
    try {
      await API.post('/cache', { name, version, result })
    } catch (err) {
      log.err({
        type: 'ERROR',
        errorType: 'CACHE_ERROR',
        value: err.data,
      })
    }
  }
}

module.exports = Cache
