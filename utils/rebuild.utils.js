const { blackList } = require("../server/config");

require('dotenv').config()
const firebase = require('firebase')
const fetch = require('node-fetch')
const fs = require('fs')
const Queue = require('promise-queue-plus')
const debug = require('debug')('rebuild:script')
const gitURLParse = require('git-url-parse')
const { resolvePackage } = require("./server.utils");
const { parsePackageString } = require("./common.utils");

const patchedDB = {}

function commit() {
  try {
    const stringified = JSON.stringify(patchedDB, null, 2)
    fs.writeFileSync('./db-patched.json', stringified, 'utf8');
  } catch (err) {
    console.error(err)
  }
}

const queue = new Queue(20, {
  retry: 0,               //Number of retries
  retryIsJump: false,     //retry now?
  timeout: 0,
  queueEnd: () => {
    try {

      const stringified = JSON.stringify(patchedDB, null, 2)
      fs.writeFileSync('./db-patched.json', stringified, 'utf8');
    } catch (err) {
      console.error(err)
    }
    // console.log('done', patchedDB)
  }
})

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

function encodeFirebaseKey(key) {
  return key
    .replace(/[.]/g, ',')
    .replace(/\//g, '__')
}

function decodeFirebaseKey(key) {
  return key
    .replace(/[,]/g, '.')
    .replace(/__/g, '/')
}

async function getFirebaseStore() {
  try {
    const snapshot = await firebase.database()
      .ref('modules-v2')
      .once('value')
    return snapshot.val()
  } catch (err) {
    console.log(err)
    return {}
  }
}

async function getPackageResult({ name, version }) {
  const ref = firebase.database().ref()
    .child('modules-v2')
    .child(encodeFirebaseKey(name))
    .child(encodeFirebaseKey(version))

  const snapshot = await ref.once('value')
  return snapshot.val()
}

function filterBlacklistedPackages() {
  blackList
}


async function run() {
  const packages = []

  const packs = require('../db2.json')//await getFirebaseStore()
  // fs.writeFileSync('./db.json', JSON.stringify(packs, null, 2))


  Object.keys(packs).forEach(packName => {
    Object.keys(packs[packName]).forEach(version => {
      // if (packName !== 'react') return
      //
      if (blackList.some(entry => entry.test(packName))) {
        return
      }

      const packageString = `${decodeFirebaseKey(packName)}@${decodeFirebaseKey(version)}`
      queue.push(() => resolvePackage(parsePackageString(packageString)))
        .then(async (packInfo) => {
          const { description, repository } = packInfo
          let truncatedDescription = ''
          let repositoryURL = ''
          try {
            repositoryURL = gitURLParse(repository.url || repository).toString("https");
          } catch (e) {
            console.error('failed to parse repository url', repository)
          }

          try {
            truncatedDescription = description.length > 300 ? description.substring(0, 300) + '…' : description
          } catch (e) {
            console.error('failed to parse description', description)
          }

          debug('%s fetched', `${packName}@${version}`)
          console.log('GOT', truncatedDescription, '\n', repositoryURL)

          if (!patchedDB[packName]) {
            patchedDB[packName] = {}
          }
          patchedDB[packName][version] = {
            description: truncatedDescription,
            repository: repositoryURL,
            ...packs[packName][version]
          }

          if (packName === 'zzzz-npm-test') {
            commit()
          }
        })
        .catch((err) => {
          // patchedDB[packName][version] = {
          //   description: '',
          //   repository: '',
          //   ...packs[packName][version]
          // }
          if (packName === 'zzzz-npm-test') {
            commit()
          }
          console.log('fetch for ' + packageString, err)
        })
    })
  })
  // const failIndexes = []
  //
  // const startIndex = 16500
  // const endIndex = 17000
  // console.log('total packages', packages.length)
  //
  // packages
  //   .slice(startIndex, endIndex)
  //   .forEach((pack, index) =>
  //     queue.push(() => fetch(`http://127.0.0.1:5000/api/size?package=${pack}&force=true`)
  //       .then(async (r) => {
  //         debug('%s fetched %s', (startIndex + index).toLocaleString(), pack)
  //       })
  //       .catch((err) => {
  //         failIndexes.push(startIndex + index)
  //         console.log('fetch for ' + pack + ' failed', err)
  //         throw err
  //       }))
  //   )
  queue.start()
  // fs.writeFileSync(`./failures-${startIndex}-${endIndex}.json`, JSON.stringify({failures: failIndexes}), 'utf8')

}

run()

