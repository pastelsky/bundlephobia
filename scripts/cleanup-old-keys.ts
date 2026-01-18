import * as fs from 'fs'
import * as path from 'path'
import * as admin from 'firebase-admin'
import * as semver from 'semver'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/StreamArray'
import { streamObject } from 'stream-json/streamers/StreamObject'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSONStream = require('JSONStream')
import progress from 'progress-stream'

// Initialize Firebase (you'll need to set up your service account key)
admin.initializeApp({
  credential: admin.credential.cert(
    path.join(
      __dirname,
      './keys/module-cost-firebase-adminsdk-xcnum-ca64ae80ff.json'
    )
  ),
  databaseURL: 'https://module-cost.firebaseio.com',
})
const db = admin.database()

interface SearchesV2 {
  [packageName: string]: {
    lastSearched: number
    count: number
  }
}

const searchesV2: SearchesV2 = {}
const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000 // Approximate 6 months in milliseconds

function formatETA(seconds: number): string {
  const sec = Math.floor(seconds % 60)
  const min = Math.floor((seconds / 60) % 60)
  const hr = Math.floor(seconds / 3600)

  return [hr, min, sec].map(v => v.toString().padStart(2, '0')).join(':')
}

async function processBackupFile(
  backupFilePath: string,
  dryRun: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(backupFilePath).size
    const progressStream = progress({
      length: fileSize,
      time: 1000, // Update every second
    })

    progressStream.on('progress', progressData => {
      const percentage = progressData.percentage.toFixed(2)
      const eta = formatETA(progressData.eta)
      process.stdout.write(
        `Processing backup file: ${percentage}% | ETA: ${eta}   \r`
      )
    })

    const outputStream = fs.createWriteStream('pruned-module-cost-v2.json')
    const stringifyStream = JSONStream.stringifyObject()
    stringifyStream.pipe(outputStream)

    let packageCount = 0
    let prunedPackageCount = 0
    let packagesRemoved = 0
    let versionsRemoved = 0
    let originalSize = 0
    let prunedSize = 0

    const pipeline = chain([
      fs.createReadStream(backupFilePath).pipe(progressStream),
      parser(),
      streamObject(),
    ] as any)

    let isProcessingSearchesV2 = false
    let isProcessingModuleCostV2 = false

    pipeline.on('data', ({ key, value }) => {
      if (key === 'searches-v2') {
        isProcessingSearchesV2 = true
        processSearchesV2(value).then(() => {
          isProcessingSearchesV2 = false
        })
      } else if (key === 'modules-v2') {
        if (isProcessingSearchesV2) {
          // Wait until searches-v2 processing is complete
          const interval = setInterval(() => {
            if (!isProcessingSearchesV2) {
              clearInterval(interval)
              processModuleCostV2(value)
            }
          }, 100)
        } else {
          processModuleCostV2(value)
        }
      }
    })

    pipeline.on('end', () => {
      stringifyStream.end()
      console.log('\nProcessing completed.')

      // Print summary
      console.log('\nPruning Summary:')
      console.log(`Original package count: ${packageCount}`)
      console.log(`Pruned package count: ${prunedPackageCount}`)
      console.log(`Packages removed: ${packagesRemoved}`)
      console.log(`Versions removed: ${versionsRemoved}`)
      console.log(
        `Original size: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`
      )
      console.log(`Pruned size: ${(prunedSize / (1024 * 1024)).toFixed(2)} MB`)
      console.log(
        `Size reduction: ${(
          ((originalSize - prunedSize) / originalSize) *
          100
        ).toFixed(2)}%`
      )

      if (!dryRun) {
        console.log('Pushing pruned data to Firebase...')
        uploadPrunedDataToFirebase('pruned-module-cost-v2.json')
          .then(() => {
            console.log(
              'Pruned data has been pushed to module-cost-pruned table'
            )
            resolve()
          })
          .catch(reject)
      } else {
        console.log('Dry run complete. No data has been modified.')
        resolve()
      }
    })

    pipeline.on('error', err => {
      console.error('Error processing backup file:', err)
      reject(err)
    })

    async function processSearchesV2(searchesData: any): Promise<void> {
      return new Promise(resolve => {
        const searchesPipeline = chain([streamObject()])

        searchesPipeline.on('data', ({ key, value }) => {
          searchesV2[key] = value as SearchesV2[string]
        })

        searchesPipeline.on('end', () => {
          console.log(
            `\nFinished processing searches-v2, total ${
              Object.keys(searchesV2).length
            } searches`
          )
          resolve()
        })

        searchesPipeline.write({ key: null, value: searchesData })
        searchesPipeline.end()
      })
    }

    function processModuleCostV2(moduleData: any): void {
      const modulePipeline = chain([streamObject()])

      modulePipeline.on('data', ({ key: packageName, value: versionsObj }) => {
        packageCount++
        originalSize += JSON.stringify(versionsObj).length

        const searchInfo = searchesV2[packageName]

        let action = ''
        let reason = ''

        // Check if package should be removed based on search criteria
        if (
          !searchInfo ||
          searchInfo.count <= 1 ||
          searchInfo.lastSearched < sixMonthsAgo
        ) {
          packagesRemoved++
          action = 'Pruned'
          if (!searchInfo) {
            reason = 'Not found in searches-v2'
          } else if (searchInfo.count <= 1) {
            reason = `Search count (${searchInfo.count}) <= 1`
          } else if (searchInfo.lastSearched < sixMonthsAgo) {
            reason = 'Last searched more than 6 months ago'
          }

          console.log(
            `Package: ${packageName} | Action: ${action} | Reason: ${reason}`
          )
          return
        }

        // Sort versions and keep only the last 20
        const sortedVersions = Object.keys(versionsObj).sort((a, b) =>
          semver.compare(b, a)
        )
        const versionsToKeep = sortedVersions.slice(0, 20)

        if (sortedVersions.length > 20) {
          versionsRemoved += sortedVersions.length - 20
          action = 'Pruned versions'
          reason = `Keeping only the latest 20 versions`
        } else {
          action = 'Kept'
          reason = `All versions are within limit`
        }

        const prunedVersions: { [version: string]: any } = {}
        for (const version of versionsToKeep) {
          prunedVersions[version] = versionsObj[version]
        }

        prunedPackageCount++
        prunedSize += JSON.stringify(prunedVersions).length

        // Write to output stream
        ;(stringifyStream as any).write([packageName, prunedVersions])

        console.log(
          `Package: ${packageName} | Action: ${action} | Reason: ${reason}`
        )
      })

      modulePipeline.on('end', () => {
        // Module-cost-v2 processing done
      })

      modulePipeline.write({ key: null, value: moduleData })
      modulePipeline.end()
    }
  })
}

async function uploadPrunedDataToFirebase(filePath: string) {
  const prunedRef = db.ref('module-cost-pruned')
  const readStream = fs.createReadStream(filePath)
  const parseStream = JSONStream.parse('*')
  const pipeline = chain([readStream, parseStream] as any)

  let buffer: { [key: string]: any } = {}
  let count = 0

  return new Promise<void>((resolve, reject) => {
    pipeline.on('data', ({ key, value }) => {
      buffer[key] = value
      count++

      if (count % 1000 === 0) {
        prunedRef.update(buffer)
        buffer = {}
        console.log(`Uploaded ${count} packages to Firebase`)
      }
    })

    pipeline.on('end', () => {
      if (Object.keys(buffer).length > 0) {
        prunedRef.update(buffer)
        console.log(`Uploaded remaining packages to Firebase`)
      }
      resolve()
    })

    pipeline.on('error', err => {
      console.error('Error uploading pruned data to Firebase:', err)
      reject(err)
    })
  })
}

// Run the script
const backupFilePath = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!backupFilePath) {
  console.error('Please provide the path to the backup file as an argument.')
  process.exit(1)
}

;(async () => {
  try {
    console.log('Starting processing of backup file...')
    await processBackupFile(backupFilePath, dryRun)
  } catch (error) {
    console.error('An error occurred:', error)
  }
})()
