'use strict'

const Koa = require('koa')
const app = new Koa()
const router = require('koa-router')()
const exec = require('child_process').exec
const fs = require('fs-promise')
const path = require('path')
const rollup = require('rollup')
const resolve = require('rollup-plugin-node-resolve')
const commonjs = require('rollup-plugin-commonjs')
const json = require('rollup-plugin-json')
const replace = require('rollup-plugin-replace')
const uglify = require('rollup-plugin-uglify')
const { minify } = require('uglify-js-harmony')
const bytesize = require('bytesize')
const log = require('pretty-log')
const compress = require('koa-compress')
//const del = require('del')
const camelcase = require('camelcase')
//const babel = require('rollup-plugin-babel')
const cache = require('./cache')
const cacheControl = require('koa-cache-control')
const now = require('performance-now')
const koaStatic = require('koa-static')

app.use(cacheControl())

app.use(compress({
  filter: function (contentType) {
    return /(text|json|javascript|svg)/.test(contentType)
  },
  threshold: 2048,
  flush: require('zlib').Z_SYNC_FLUSH
}))

app
  .use(router.routes())
  .use(router.allowedMethods())

router.get('/sw.js', async (ctx) => {
  const swPath = path.join(__dirname, '..', 'build', 'sw.js')

  if (fs.existsSync(swPath)) {
    const content = fs.readFileSync(swPath, 'utf-8')
    ctx.set('Content-Type', 'application/javascript')
    ctx.body = content
  }
})

app.use(koaStatic(path.join(__dirname, '..', 'build'), {
  maxage: 24 * 60 * 60 * 1000
}))

function execPromise (command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, function (error, stdout, stderr) {
      if (error) {
        reject(error)
      } else {
        resolve(stdout)
      }
    })
  })
}

function build (entry, peerDeps) {
  console.log('externals are', peerDeps)
  return rollup.rollup({
    entry: entry,
    external: peerDeps,
    plugins: [
      resolve({
        jsnext: false,
        main: true,
        browser: true,
        extensions: ['.js', '.json'],
        skip: peerDeps
      }),
      json(),
      commonjs({
        exclude: peerDeps,
        sourceMap: false
      }),
      replace({
        ENV: 'production',
        'process.env.NODE_ENV': "'production'"
      }),
      // babel({
      //  babelrc: false,
      //  presets: ["es2015-rollup"],
      // }),
      uglify({}, minify)
    ]
  })
    .catch(err => {
      log.error('Build Error')
      console.log(err.stack)
      return Promise.reject(err)
    })
}

function getFileSize (file) {
  return new Promise((resolve, reject) => {
    bytesize.fileSize(file, false, (error, size) => {
      if (error) {
        reject(error)
      } else {
        resolve(size)
      }
    })
  })
}

function getGZIPFileSize (file) {
  return new Promise((resolve, reject) => {
    bytesize.gzipSize(file, false, (error, size) => {
      if (error) {
        reject(error)
      } else {
        resolve(size)
      }
    })
  })
}

function getDependencies (packagePath) {
  const { dependencies = {}, devDependencies = {} } = require(packagePath + '/package.json')

  return {
    dependencies: Object.keys(dependencies).length,
    devDependencies: Object.keys(devDependencies).length
  }
}

async function parsePackageString (packageString) {
  let packageName, version
  const lastAtIndex = packageString.lastIndexOf('@')

  // Scoped packages
  if (packageString.startsWith('@')) {
    if (lastAtIndex === 0) {
      packageName = packageString
    } else {
      packageName = packageString.substring(0, lastAtIndex)
    }
  } else {
    if (lastAtIndex === -1) {
      packageName = packageString
    } else {
      packageName = packageString.substring(0, lastAtIndex)
    }
  }

  const versionInfo = JSON.parse(await execPromise(`npm view --json ${packageString} version`))
  version = Array.isArray(versionInfo) ? versionInfo[0] : versionInfo

  return {
    packageName, version
  }
}

function getEntryPoint (packagePath) {
  const packageJSON = require(path.join(packagePath, 'package.json'))
  const entryFile = packageJSON.main ||
    packageJSON.module ||
    packageJSON['jsnext:main'] ||
    (typeof packageJSON.browser === 'string' ? packageJSON.browser : '')
  return require.resolve(path.join(packagePath, entryFile))
}

function getPeerDeps (packagePath) {
  const packageJSON = require(path.join(packagePath, 'package.json'))
  return 'peerDependencies' in packageJSON
    ? Object.keys(packageJSON.peerDependencies) : []
}

router.get('/package', async (ctx, next) => {
  const startTime = now()

  const { packageName, version } = await parsePackageString(ctx.query.name)
  log.debug(`Package: Name: ${packageName} | Version ${version}`)

  const replyWithSuccess = (data) => {
    ctx.cacheControl = {
      maxAge: 60
    }

    ctx.status = 200
    ctx.headers['Content-Type'] = 'application/json; charset=utf-8'
    ctx.body = data

    log.success(`${packageName}@${version}: ${data.size} in ${((now() - startTime) / 1000).toFixed(2)} s`)
  }

  if (!version) {
    ctx.status = 422
    ctx.headers['Content-Type'] = 'application/json; charset=utf-8'
    ctx.body = {
      package: packageName,
      version: version,
      error: `Version ${version} is invalid for package '${packageName}'`
    }

    return
  }

  if (!ctx.query.forceBuild) {
    const cacheEntry = await cache.get(packageName, version)

    if (cacheEntry) {
      replyWithSuccess(cacheEntry)
      return
    }
  }

  try {
    // @TODO: ADD some sort of queuing here, or it's gonna suck.
    await execPromise(`yarn add ${ctx.query.name} --ignore-flags --exact`, { cwd: './tmp' })

    const rootPath = path.join(__dirname, '..')
    const packagePath = path.join(rootPath, 'tmp', 'node_modules', packageName)
    const bundlePath = path.join(rootPath, 'tmp-build', 'bundle.js')

    try {
      log.debug(`Entry file for ${packagePath}`)
      log.debug(`Entry file for ${getEntryPoint(packagePath)}`)
      const bundle = await build(getEntryPoint(packagePath), getPeerDeps(packagePath))

      await bundle.write({
        moduleName: camelcase(packageName),
        dest: bundlePath,
        format: 'iife'
      })

      const [fileSize, gzipSize] = await Promise.all([
        getFileSize(bundlePath),
        getGZIPFileSize(bundlePath)
      ])

      if (fileSize !== 0) {
        const dataToSend = Object.assign({}, {
          package: packageName,
          version: version || null,
          size: fileSize,
          gzipSize: gzipSize
        },
          getDependencies(packagePath)
        )

        replyWithSuccess(dataToSend)
        cache.set(packageName, version, dataToSend)
      } else {
        throw new Error('race condition hit?')
      }
    } catch (err) {
      ctx.status = 400
      ctx.headers['Content-Type'] = 'application/json; charset=utf-8'
      ctx.body = {
        package: packageName,
        version: version,
        error: 'Oops. Something went wrong while fetching or building the package.'
      }

      console.error(err)
    } finally {
      // await Promise.all([
      //  del(path.join(rootPath, 'build') + '/*/**'),
      //  del(path.join(rootPath, 'tmp') + '/*/**'),
      // ])
    }
  } catch (err) {
    ctx.status = 404
    ctx.body = {
      package: packageName,
      version: version,
      error: 'Package not found / Build failed'
    }
    ctx.headers['Content-Type'] = 'application/json; charset=utf-8'
    console.error(err.toString())
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log('listening on port 3000')
})
