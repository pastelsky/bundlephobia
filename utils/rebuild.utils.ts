import 'dotenv-defaults/config'

import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'

import axios from 'axios'
import createDebug from 'debug'
import firebase from 'firebase'

import config from '../server/config'

interface QueueModule {
  new (
    concurrency: number,
    options: {
      retry: number
      retryIsJump: boolean
      timeout: number
    }
  ): {
    push<T>(task: () => Promise<T>): void
    start(): void
  }
}

type DeepEqual = (left: unknown, right: unknown) => boolean
type Mkdir = (directory: string) => Promise<void>

interface GotResponse<TBody> {
  body: TBody
}

interface GotModule {
  <TBody = string>(
    url: string,
    options?: {
      json?: boolean
    }
  ): Promise<GotResponse<TBody>>
}

interface PackageBuildResult {
  gzip: number
  size: number
  [key: string]: unknown
}

type PackageStore = Record<string, Record<string, PackageBuildResult>>

const Queue = require('promise-queue-plus') as QueueModule
const deepEqual = require('lodash.isequal') as DeepEqual
const mkdir = require('mkdir-promise') as Mkdir
const got = require('got') as GotModule

const debug = createDebug('rebuild:script')
const debugWarning = createDebug('rebuild:warning')

const patchedDB: Record<string, Record<string, unknown>> = {}

function commit() {
  try {
    const stringified = JSON.stringify(patchedDB, null, 2)
    fs.writeFileSync('./db-patched.json', stringified, 'utf8')
  } catch (error) {
    console.error(error)
  }
}

const queue = new Queue(10, {
  retry: 2,
  retryIsJump: false,
  timeout: 0,
})

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig)
}

function encodeFirebaseKey(key: string) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}

function decodeFirebaseKey(key: string) {
  return key.replace(/[,]/g, '.').replace(/__/g, '/')
}

async function getFirebaseStore() {
  try {
    const snapshot = await firebase.database().ref('modules-v2').once('value')
    return (snapshot.val() as PackageStore | null) ?? {}
  } catch (error) {
    console.log(error)
    return {}
  }
}

async function getPackageResult({
  name,
  version,
}: {
  name: string
  version: string
}) {
  const ref = firebase
    .database()
    .ref()
    .child('modules-v2')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

function trim(packages: PackageStore) {
  let canTrim = 0
  const trimsMap: Record<string, string[]> = {}

  Object.keys(packages).forEach(name => {
    const versions = Object.keys(packages[name])

    if (versions.length > 15) {
      canTrim += versions.length - 15

      versions.slice(-15).forEach(version => {
        if (name in trimsMap) {
          trimsMap[name].push(version)
        } else {
          trimsMap[name] = [version]
        }
      })
    }
  })

  console.log('trims are', trimsMap)
  console.log('can trim', canTrim)
}

async function run() {
  let packages: Array<{ packName: string; version: string }> = []

  const packs = require('../modules-v2.json') as PackageStore
  const packsNew = require('../modules-v2-new.json') as PackageStore
  const failIndexes: number[] = []

  const startIndex = 2000
  const endIndex = 4239

  Object.keys(packs).forEach(packName => {
    Object.keys(packs[packName]).forEach(version => {
      packages.push({ packName, version })
    })
  })

  packages = packages.filter(pack => {
    const oldPackage = packs[pack.packName]?.[pack.version]
    const newPackage = packsNew[pack.packName]?.[pack.version]

    return deepEqual(oldPackage, newPackage)
  })

  console.log('package count is', packages.length)

  packages.slice(startIndex, endIndex).forEach((pack, index) => {
    const packString = `${decodeFirebaseKey(pack.packName)}@${decodeFirebaseKey(
      pack.version
    )}`

    queue.push(() =>
      got<{ gzip: number; size: number }>(
        `http://127.0.0.1:5000/api/size?package=${packString}&force=true`,
        { json: true }
      )
        .then(async response => {
          const result = response.body
          const previous = packs[pack.packName][pack.version]
          const gzipDiff = Math.abs(result.gzip - previous.gzip)
          const minDiff = Math.abs(result.size - previous.size)

          debug(
            '%d fetched %s, diff: %d KB',
            startIndex + index,
            packString,
            Math.round(gzipDiff / 1024)
          )

          if (gzipDiff / previous.gzip > 0.05 && gzipDiff > 4000) {
            debugWarning(
              'GZIP sizes for %s vary more than %d. Old: %d KB, After rebuild: %d KB',
              packString,
              gzipDiff,
              Math.round(previous.gzip / 1024),
              Math.round(result.gzip / 1024)
            )
          }

          if (minDiff / previous.size > 0.05 && minDiff > 7000) {
            debugWarning(
              'MIN sizes for %s vary more than %d. Old: %d KB, After rebuild: %d KB',
              packString,
              minDiff,
              Math.round(previous.size / 1024),
              Math.round(result.size / 1024)
            )
          }
        })
        .catch(error => {
          failIndexes.push(startIndex + index)
          console.log(`fetch for ${packString} failed`, error)
          throw error
        })
    )
  })

  queue.start()
}

async function installPackage(packageName: string, installPath: string) {
  const flags = [
    'cache=/tmp/tmp-build/cache',
    'no-package-lock',
    'no-shrinkwrap',
    'no-optional',
    'no-bin-links',
    'prefer-offline',
    'progress false',
    'loglevel error',
    'ignore-scripts',
    'save-exact',
    'json',
  ]
  const command = `npm install ${packageName} --${flags.join(' --')}`

  debug('install start %s', packageName)

  try {
    await exec(command, {
      cwd: installPath,
    })
    debug('install finish %s', packageName)
  } catch (error) {
    console.log(error)
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('code E404')) {
      throw new Error('PackageNotFoundError')
    }
    throw new Error('InstallError')
  }
}

function exec(command: string, options: childProcess.ExecOptions) {
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr)))
      } else {
        resolve(String(stdout))
      }
    })
  })
}

async function getExports(name: string, version: string) {
  const packageName = `${name}@${version}`
  const temporaryPath = `/tmp/build/${packageName
    .replace(/@/g, '-')
    .replace(/\//g, '-')
    .replace(/\./g, '')}`

  console.log(temporaryPath, 'pathtmp')
  await mkdir(temporaryPath)

  fs.writeFileSync(
    path.join(temporaryPath, 'package.json'),
    JSON.stringify({ dependencies: {} })
  )

  fs.writeFileSync(
    path.join(temporaryPath, 'index.js'),
    JSON.stringify({ dependencies: {} })
  )

  await installPackage(packageName, temporaryPath)
  const exportsObject = require(path.join(
    temporaryPath,
    'node_modules',
    name
  )) as Record<string, unknown>
  return Object.keys(exportsObject)
}

async function rebuildTopLevelExports() {
  const packs = require('../modules-v2.json') as PackageStore
  const packages: Array<{ name: string; version: string }> = []

  Object.keys(packs).forEach(name => {
    Object.keys(packs[name]).forEach(version => {
      packages.push({ name, version })
    })
  })

  packages.forEach(pack => {
    queue.push(() =>
      getExports(
        decodeFirebaseKey(pack.name),
        decodeFirebaseKey(pack.version)
      ).then(exportsList => {
        debug('got exports for %s %s %o', pack.name, pack.version, exportsList)
        return axios.post('localhost:7001/cache', {
          name: pack.name,
          version: pack.version,
          result: {
            ...packs[pack.name][pack.version],
            topLevelExports: exportsList,
          },
        })
      })
    )
  })

  queue.start()
}

void config.blackList
void commit
void getFirebaseStore
void getPackageResult
void trim
void rebuildTopLevelExports

void run()
