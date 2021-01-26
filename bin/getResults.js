const firebase = require('firebase')
const { encodeFirebaseKey, decodeFirebaseKey } = require('../utils/index')
const fs = require('fs')
require('dotenv').config()

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

function getFirebaseStoreFromDisk() {
  try {
    return require('./data/firebase-modules.json')
  } catch (err) {
    console.log('not found on disk')
    return null
  }
}

async function getFirebaseStoreFromNetwork() {
  const modulesRef = firebase.database().ref('modules-v2')
  const lastEntry = Object.keys(
    await modulesRef
      .limitToLast(1)
      .once('value')
      .then(snapshot => snapshot.val())
  )[0]

  const firstEntry = Object.keys(
    await modulesRef
      .limitToFirst(1)
      .once('value')
      .then(snapshot => snapshot.val())
  )[0]

  let currentLastEntry = firstEntry
  let allData = {}
  let counter = 0

  console.log('fetching from ', firstEntry, ' to ', lastEntry)

  while (currentLastEntry !== lastEntry) {
    counter += 20000
    const snapshot = await firebase
      .database()
      .ref('modules-v2')
      .orderByKey()
      .startAt(currentLastEntry)
      .limitToFirst(20000)
      .once('value')
      .then(snapshot => snapshot.val())

    const packageNames = Object.keys(snapshot)
    currentLastEntry = packageNames[packageNames.length - 1]
    console.log(
      'Fetched records till ',
      counter,
      currentLastEntry,
      'total of ',
      Object.keys(snapshot),
      ' packages.'
    )
    allData = { ...allData, ...snapshot }
  }

  fs.mkdirSync(__dirname + '/data', { recursive: true })

  fs.writeFileSync(
    __dirname + '/data/firebase-modules.json',
    JSON.stringify(allData, null, 2),
    'utf8'
  )
  return allData
}

async function getResults() {
  let firebaseStore = getFirebaseStoreFromDisk()
  console.log('loaded firebase store')
  return Object.keys(firebaseStore).flatMap(packageName =>
    Object.keys(firebaseStore[packageName]).map(
      version => firebaseStore[packageName][version]
    )
  )
}

async function getPackages() {
  let firebaseStore =
    getFirebaseStoreFromDisk() || (await getFirebaseStoreFromNetwork())
  const packages = Object.keys(firebaseStore).map(
    packageName => firebaseStore[packageName]
  )
  console.log('fetched ', Object.keys(firebaseStore), ' packages ')
  return packages
}

module.exports = { getResults, getPackages }
