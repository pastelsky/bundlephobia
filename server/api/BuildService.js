const axios = require('axios')
const { requestQueue } = require('../init')
const CONFIG = require('../config')
const { pool } = require('../init')
const CustomError = require('../CustomError')
const debug = require('debug')('bp:build')

const OpertationType = {
  PACKAGE_BUILD_STATS: 'PACKAGE_BUILD_STATS',
  PACKAGE_EXPORTS: 'PACKAGE_EXPORTS',
  PACKAGE_EXPORTS_SIZES: 'PACKAGE_EXPORTS_SIZES',
}

class BuildService {
  constructor() {
    const operations = [
      {
        type: OpertationType.PACKAGE_BUILD_STATS,
        endpoint: '/size',
        methodName: 'getPackageStats',
      },
      {
        type: OpertationType.PACKAGE_EXPORTS,
        endpoint: '/exports',
        methodName: 'getAllPackageExports',
      },
      {
        type: OpertationType.PACKAGE_EXPORTS_SIZES,
        endpoint: '/exports-sizes',
        methodName: 'getPackageExportSizes',
      },
    ]

    operations.forEach(operation => {
      requestQueue.addExecutor(operation.type, async ({ packageString }) => {
        if (process.env.BUILD_SERVICE_ENDPOINT) {
          try {
            const response = await axios.get(
              `${process.env.BUILD_SERVICE_ENDPOINT}${
                operation.endpoint
              }?p=${encodeURIComponent(packageString)}`
            )
            return response.data
          } catch (error) {
            this._handleError(error, operation.type)
          }
        } else {
          return await pool
            .exec(operation.methodName, [packageString])
            .timeout(CONFIG.WORKER_TIMEOUT)
        }
      })
    })
  }

  _handleError(error, operationType) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const contents = error.response.data
      throw new CustomError(
        contents.name || 'BuildError',
        contents.originalError,
        contents.extra
      )
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      debug('No response received from build server. Is the server down?')
      throw new CustomError('BuildError', {
        operation: operationType,
        reason: 'BUILD_SERVICE_UNREACHABLE',
        url: error.request._currentUrl,
      })
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new CustomError('BuildError', error.message, {
        operation: operationType,
      })
    }
  }

  async getPackageBuildStats(packageString, priority) {
    return await requestQueue.process(
      packageString,
      OpertationType.PACKAGE_BUILD_STATS,
      { packageString },
      { priority }
    )
  }

  async getPackageExports(packageString, priority) {
    return await requestQueue.process(
      packageString,
      OpertationType.PACKAGE_EXPORTS,
      { packageString },
      { priority }
    )
  }

  async getPackageExportSizes(packageString, priority) {
    return await requestQueue.process(
      packageString,
      OpertationType.PACKAGE_EXPORTS_SIZES,
      { packageString },
      { priority }
    )
  }
}

module.exports = BuildService
