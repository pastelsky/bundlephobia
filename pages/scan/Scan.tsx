import React, { useEffect, useState } from 'react'
import Analytics from '../../client/analytics'
import ResultLayout from '../../client/components/ResultLayout'
import Separator from '../../client/components/Separator'
import MetaTags from '../../client/components/MetaTags'
import scanBlacklist from '../../client/config/scanBlacklist'
import Dropzone from 'react-dropzone'
import Router from 'next/router'
import * as semver from 'semver'

type Package = {
  name: string
  resolvedVersion: string
  versionRange: string
  selected: boolean
}

const resolveVersionFromRange = (range: string) => {
  const rangeSet = new semver.Range(range).set
  return rangeSet[0][0].semver.version
}

const Scan = () => {
  const [packages, setPackages] = useState<
    (Package & { versionRange: string })[] | null
  >(null)

  const handleDropAccepted = (acceptedFiles: File[]) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result)
        const packages = Object.keys(json.dependencies)
          .filter(packageName => {
            const versionRange = json.dependencies[packageName]
            return semver.valid(versionRange) || semver.validRange(versionRange)
          })
          .map(packageName => {
            const versionRange = json.dependencies[packageName]

            return {
              name: packageName,
              versionRange,
              resolvedVersion: resolveVersionFromRange(versionRange),
              selected: !scanBlacklist.some(regex => regex.test(packageName)),
            }
          })
        setPackages(packages)

        Analytics.scanPackageJsonDropped(packages.length)
      } catch (err) {
        showInvalidFileError()
      }
    }

    try {
      reader.readAsBinaryString(acceptedFiles[0])
    } catch (err) {
      console.error(err)
      showInvalidFileError()
    }
  }

  const handleDropRejected = () => {
    showInvalidFileError()
  }

  useEffect(() => {
    Analytics.pageView('/scan')
  }, [])

  const handleResetClick = () => {
    setPackages(null)
  }

  const showInvalidFileError = () => {
    alert('Could not parse the `package.json` file.')
    Analytics.scanParseError()
  }

  const selectedPackages = packages
    ? packages.filter(pack => pack.selected)
    : []

  const handleScanClick = () => {
    const query = selectedPackages
      .map(pack => `${pack.name}@${pack.resolvedVersion}`)
      .join(',')
    Router.push(`/scan-results?packages=${query}`)

    Analytics.performedScan()
  }

  const handleSelectionChange = (index: number) => {
    if (!packages) return
    setPackages(
      packages.map((pack: Package, i: number) =>
        index === i ? { ...pack, selected: !pack.selected } : pack
      )
    )
  }

  return (
    <ResultLayout className="scan-page">
      <MetaTags
        title="Scan package.json ❘ Bundlephobia"
        canonicalPath="/scan"
        description="Scan dependencies in your package.json to find the largest and heaviest npm packages in your frontend javascript bundle."
      />
      {!packages ? (
        <div>
          <Dropzone
            className="scan__dropzone"
            onDropAccepted={handleDropAccepted}
            onDropRejected={handleDropRejected}
            multiple={false}
            accept="application/json"
          >
            <p>
              Drop a <code> package.json </code> file here
            </p>
            <Separator />
            <button className="scan__btn">
              Upload <code> package.json </code>
            </button>
          </Dropzone>
        </div>
      ) : (
        <div>
          <header className="scan__selection-header">
            <h1 className="scan__page-title"> Select packages to scan </h1>
            <button className="scan__btn" onClick={handleScanClick}>
              Scan {selectedPackages.length} packages
            </button>
            <button className="scan__btn" onClick={handleResetClick}>
              Reset
            </button>
          </header>
          <ul className="scan__package-container">
            {packages.map(
              ({ name, versionRange, resolvedVersion, selected }, i) => (
                <li className="scan__package-item" key={name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => handleSelectionChange(i)}
                    />
                    <span className="scan__package-item-title">
                      <span>{name}</span>
                      <span className="scan__package-item-version">
                        {versionRange} &rarr; {resolvedVersion}
                      </span>
                    </span>
                  </label>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </ResultLayout>
  )
}

export default Scan
