/**
 * A modified version from the `import-cost` project
 * @see https://github.com/wix/import-cost/blob/master/packages/import-cost/src/webpack.js
 */

const fs = require("fs")
const path = require("path")
const { gzipSync } = require("zlib")
const debug = require("debug")("bp:worker")

const webpack = require("webpack")
const MemoryFS = require("memory-fs")
const UglifyJSPlugin = require("uglifyjs-webpack-plugin")

const { getExternals } = require("../utils/server.utils")
const { exec } = require("../utils/server.utils")
const CustomError = require("./CustomError")
const config = require("./config")

function getEntryPoint(name) {
  const entryPath = path.join(
    config.tmp,
    "entries",
    `index-${name.replace("/")}}.js`,
  )

  try {
    fs.writeFileSync(
      entryPath,
      `const p  = require('${name}'); console.log(p)`,
      "utf-8",
    )
    return entryPath
  } catch (err) {
    throw new CustomError("EntryPointError", err)
  }
}

async function installPackage(packageName) {
  try {
    //const flags = ['ignore-flags', 'skip-integrity-check', 'exact', 'json', 'no-progress', 'silent', 'no-lockfile', 'no-bin-links', 'ignore-optional', 'mutex network']

    const flags = [
      // Setting cache is required for concurrent `npm install`s to work
      `cache=${path.join(__dirname, "cache")}`,
      "no-package-lock",
      "no-shrinkwrap",
      "no-optional",
      "no-bin-links",
      "prefer-offline",
      "progress false",
      "loglevel error",
      "ignore-scripts",
      "save-exact",
      "fetch-retry-factor 0",
      "fetch-retries 0",
      "json",
    ]

    debug("install start %s", packageName)
    await exec(`npm i --save ${packageName} --${flags.join(" --")}`, {
      cwd: config.tmp,
    })
    debug("install finish %s", packageName)
  } catch (err) {
    throw new CustomError("InstallError", err)
  }
}

function buildPackage(name, externals) {
  const entryPoint = getEntryPoint(name)

  const compiler = webpack({
    entry: entryPoint,
    target: "web",
    plugins: [
      new webpack.DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify("production"),
        },
      }),
      new webpack.IgnorePlugin(/^electron$/),
      new webpack.LoaderOptionsPlugin({ minimize: true }),
      new UglifyJSPlugin({
        uglifyOptions: {
          ie8: false,
        },
      }),
    ],
    resolve: {
      modules: ["node_modules"],
      symlinks: false,
      cacheWithContext: false,
    },
    module: {
      rules: [
        {
          test: /\.s?css$/,
          use: "css-loader",
        },
      ],
    },
    node: {
      fs: "empty",
      net: "empty",
      tls: "empty",
      module: "empty",
      child_process: "empty",
      dns: "empty",
    },
    output: {
      filename: "bundle.js",
    },
    externals,
  })

  const memoryFileSystem = new MemoryFS()
  compiler.outputFileSystem = memoryFileSystem

  return new Promise((resolve, reject) => {
    debug("build start %s", name)
    compiler.run((err, stats) => {
      debug("build end %s", name)

      fs.unlinkSync(entryPoint)

      const jsonStats = stats.toJson()
      if (err || jsonStats.errors.length > 0) {
        reject(new CustomError("BuildError", err || stats.toJson().errors))
      } else {
        const size = jsonStats.assets.filter(x => x.name === "bundle.js").pop()
          .size

        const bundle = path.join(process.cwd(), "bundle.js")
        const gzip = gzipSync(memoryFileSystem.readFileSync(bundle), {}).length

        debug("build result %O", { size, gzip })
        resolve({ size, gzip })
      }
    })
  })
}

async function getPackageSize(packageString, packageName) {
  await installPackage(packageString)
  const externals = getExternals(packageName)
  return buildPackage(packageName, externals)
}

module.exports = getPackageSize
