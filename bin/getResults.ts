import fs from 'fs'
import path from 'path'
import firebase from 'firebase'

import 'dotenv/config'

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

firebase.initializeApp(firebaseConfig)

function getFirebaseStoreFromDisk() {
  try {
    const firebaseModulesPath = path.join(__dirname, 'data/firebase-modules.json')
    return JSON.parse(
      fs.readFileSync(firebaseModulesPath, 'utf8')
    ) as Record<string, Record<string, unknown>>
  } catch (err) {
    console.log('not found on disk')
    return null
  }
}

async function getFirebaseStoreFromNetwork() {
  const modulesRef = firebase.database().ref('modules-v2')
  const lastSnapshot =
    ((await modulesRef.limitToLast(1).once('value').then(snapshot => snapshot.val())) as
      | Record<string, unknown>
      | null) ?? {}
  const firstSnapshot =
    ((await modulesRef
      .limitToFirst(1)
      .once('value')
      .then(snapshot => snapshot.val())) as Record<string, unknown> | null) ??
    {}

  const lastEntry = Object.keys(lastSnapshot)[0]
  const firstEntry = Object.keys(firstSnapshot)[0]

  let currentLastEntry = firstEntry
  let allData: Record<string, Record<string, unknown>> = {}
  let counter = 0

  console.log('fetching from ', firstEntry, ' to ', lastEntry)

  while (currentLastEntry !== lastEntry) {
    counter += 20000
    const snapshot = (await firebase
      .database()
      .ref('modules-v2')
      .orderByKey()
      .startAt(currentLastEntry)
      .limitToFirst(20000)
      .once('value')
      .then(snapshot => snapshot.val())) as Record<
      string,
      Record<string, unknown>
    >

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

export async function getResults() {
  const firebaseStore = getFirebaseStoreFromDisk() ?? {}
  console.log('loaded firebase store')
  return Object.keys(firebaseStore ?? {}).flatMap(packageName =>
    Object.keys((firebaseStore ?? {})[packageName]).map(
      version => (firebaseStore as Record<string, Record<string, unknown>>)[packageName][version]
    )
  )
}

export async function getPackages() {
  const firebaseStore =
    getFirebaseStoreFromDisk() || (await getFirebaseStoreFromNetwork())
  const packages = Object.keys(firebaseStore).map(
    packageName => firebaseStore[packageName]
  )
  console.log('fetched ', Object.keys(firebaseStore), ' packages ')
  return packages
}

export {}
