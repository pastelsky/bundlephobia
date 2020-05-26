require('dotenv-defaults').config()
const semver = require('semver')
const axios = require('axios')
const fetch = require('node-fetch')
const pacote = require('pacote')
const Queue = require('../server/Queue')

const CustomError = require('../server/CustomError')
/**
 * Given a package string
 * this function resolves to a valid version and name.
 */
async function resolvePackage(packageString) {
  try {
    return await pacote.manifest(packageString, { fullMetadata: true })
  } catch (err) {
    if (err.code === 'ETARGET') {
      throw new CustomError('PackageVersionMismatchError', null, {
        validVersions: Object.keys(err.distTags).concat(err.versions),
      })
    } else {
      throw new CustomError('PackageNotFoundError', err)
    }
  }
}

function getRequestPriority(ctx) {
  const client = ctx.headers['x-bundlephobia-user']

  switch (client) {
    case 'bundlephobia website':
      return Queue.priority.HIGH
      break
    case 'yarn website':
      return Queue.priority.LOW
      break

    default:
      return Queue.priority.MEDIUM
  }
}

module.exports = { getRequestPriority, resolvePackage }
