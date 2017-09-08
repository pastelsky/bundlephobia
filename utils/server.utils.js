const semver = require('semver')
const fetch = require('node-fetch')

const CustomError = require('../server/CustomError')

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

module.exports = { resolvePackage }