import fs from 'fs'
import path from 'path'
import { initializeApp } from 'firebase/app'
import {
  get,
  getDatabase,
  limitToFirst,
  limitToLast,
  orderByKey,
  query,
  ref,
  startAt,
} from 'firebase/database'

import 'dotenv/config'

import type { JsonObject } from '../types/json'

interface FirebasePackageStore {
  [packageName: string]: JsonObject
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
}

initializeApp(firebaseConfig)

function getFirebaseStoreFromDisk() {
  try {
    const firebaseModulesPath = path.join(__dirname, 'data/firebase-modules.json')

    // SAFETY: the local Firebase snapshot is written using FirebasePackageStore.
    return JSON.parse(
      fs.readFileSync(firebaseModulesPath, 'utf8')
    ) as FirebasePackageStore
  } catch {
    console.log('not found on disk')

    return null
  }
}

async function getFirebaseStoreFromNetwork() {
  const database = getDatabase()
  const modulesRef = ref(database, 'modules-v2')

  // SAFETY: modules-v2 stores package records keyed by package name.
  const lastSnapshot = ((await get(query(modulesRef, limitToLast(1))).then(
    snapshot => snapshot.val(),
  )) as FirebasePackageStore | null) ?? {}

  // SAFETY: modules-v2 stores package records keyed by package name.
  const firstSnapshot = ((await get(query(modulesRef, limitToFirst(1))).then(
    snapshot => snapshot.val(),
  )) as FirebasePackageStore | null) ?? {}

  const lastEntry = Object.keys(lastSnapshot)[0]
  const firstEntry = Object.keys(firstSnapshot)[0]

  let currentLastEntry = firstEntry
  let allData: FirebasePackageStore = {}
  let counter = 0

  console.log('fetching from ', firstEntry, ' to ', lastEntry)

  while (currentLastEntry !== lastEntry) {
    counter += 20000

    // SAFETY: Firebase returns the modules-v2 package store at this boundary.
    const snapshot = (await get(
      query(
        modulesRef,
        orderByKey(),
        startAt(currentLastEntry),
        limitToFirst(20000),
      ),
    ).then(snapshotData => snapshotData.val())) as FirebasePackageStore

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
      version => firebaseStore[packageName][version]
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
