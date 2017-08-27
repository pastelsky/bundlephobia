const childProcess = require('child_process')
const path = require('path')
const semver = require('semver')
const fetch = require('node-fetch')

const CustomError = require('../server/CustomError')
const config = require('../server/config')

function exec(command, options) {
  return new Promise((resolve, reject) => {
    childProcess
      .exec(command, options, function (error, stdout, stderr) {
        if (error) {
          reject(stderr)
        } else {
          resolve(stdout)
        }
      })
  })
}

/**
 * Gets external peerDeps that shouldn't be a
 * part of the build in the format -
 * {  peerDep: 'peerDep' }
 */
function getExternals(packageName) {
  const externals = {}
  const packageJSONPath = path.join(config.tmp, 'node_modules', packageName, 'package.json')
  const packageJSON = require(packageJSONPath)

  if (packageJSON.peerDependencies) {
    Object.keys(packageJSON.peerDependencies)
      .forEach(peerDep => {
        externals[peerDep] = peerDep
      })
  }
  return externals
}

/**
 * Given a package name and optionally a version
 * this function resolves to a valid version and name.
 */
async function resolvePackage({ scoped, name, version }) {
  const tempVersion = version || 'latest'
  const parsedVersion = semver.valid(tempVersion)

  if (parsedVersion) {
    return { scoped, name, version: parsedVersion }
  }
  try {
    // Version info of scoped packages cannot be
    // fetched directly, hence we must fetch data
    // for all versions, which is expensive :(
    // @see https://github.com/npm/registry/issues/34
    if (scoped) {
      const [scopePart, namePart] = name.split('/')
      const response = await fetch(`https://registry.yarnpkg.com/${scopePart}${encodeURIComponent('/')}${namePart}`)
      const packageInfo = await response.json()

      if (!response.ok || !packageInfo['dist-tags'] || !packageInfo['dist-tags'][tempVersion]) {
        throw new CustomError('PackageNotFoundError', { statusText: response.statusText })
      }

      return { scoped, name, version: packageInfo['dist-tags'][tempVersion] }

    } else {
      const response = await fetch(`https://registry.yarnpkg.com/${name}/${tempVersion}`)

      if (!response.ok) {
        throw new CustomError('PackageNotFoundError', { statusText: response.statusText })
      }

      const packageInfo = await response.json()
      return { scoped, name, version: packageInfo.version }
    }
  } catch (err) {
    throw new CustomError('PackageNotFoundError', err)
  }
}

module.exports = { exec, getExternals, resolvePackage }