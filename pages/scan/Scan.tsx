import Router from 'next/router'
import React, { Component, createRef } from 'react'
import Dropzone from 'react-dropzone'
import * as semver from 'semver'

import Analytics from '../../client/analytics'
import MetaTags from '../../client/components/MetaTags'
import ResultLayout from '../../client/components/ResultLayout'
import Separator from '../../client/components/Separator'
import scanBlacklist from '../../client/config/scanBlacklist'

type PackageJsonDependencies = Record<string, string>

type ParsedPackageJson = {
  dependencies?: PackageJsonDependencies
}

type ScannablePackage = {
  name: string
  versionRange: string
  resolvedVersion: string
}

type SelectedPackage = {
  name: string
  resolvedVersion: string
}

type ScanState = {
  packages: ScannablePackage[] | null
  selectedPackages: SelectedPackage[]
  selectedPackageValues: string[]
  unsupportedPackageNames: string[]
}

type PersistedScanState = {
  packages: ScannablePackage[]
  selectedPackageValues: string[]
  unsupportedPackageNames: string[]
}

const persistedScanStateKey = 'bundlephobia.scan-state'

export default class Scan extends Component<Record<string, never>, ScanState> {
  state: ScanState = {
    packages: null,
    selectedPackages: [],
    selectedPackageValues: [],
    unsupportedPackageNames: [],
  }

  private packageSelectionContainerRef = createRef<HTMLUListElement>()

  componentDidMount() {
    Analytics.pageView('scan')

    const persistedScanState = this.readPersistedScanState()
    if (persistedScanState) {
      this.setState(
        {
          packages: persistedScanState.packages,
          selectedPackageValues: persistedScanState.selectedPackageValues,
          unsupportedPackageNames: persistedScanState.unsupportedPackageNames,
        },
        this.setSelectedPackages
      )
    }
  }

  readPersistedScanState = (): PersistedScanState | null => {
    try {
      const serializedState = window.sessionStorage.getItem(
        persistedScanStateKey
      )
      if (!serializedState) {
        return null
      }

      const parsedState = JSON.parse(serializedState) as PersistedScanState
      if (!Array.isArray(parsedState.packages)) {
        return null
      }

      return {
        packages: parsedState.packages,
        selectedPackageValues: Array.isArray(parsedState.selectedPackageValues)
          ? parsedState.selectedPackageValues
          : [],
        unsupportedPackageNames: Array.isArray(
          parsedState.unsupportedPackageNames
        )
          ? parsedState.unsupportedPackageNames
          : [],
      }
    } catch (error) {
      console.error('Could not restore scan state:', error)
      return null
    }
  }

  persistScanState = () => {
    const { packages, selectedPackageValues } = this.state

    try {
      if (!packages) {
        window.sessionStorage.removeItem(persistedScanStateKey)
        return
      }

      const persistedState: PersistedScanState = {
        packages,
        selectedPackageValues,
        unsupportedPackageNames: this.state.unsupportedPackageNames,
      }
      window.sessionStorage.setItem(
        persistedScanStateKey,
        JSON.stringify(persistedState)
      )
    } catch (error) {
      console.error('Could not persist scan state:', error)
    }
  }

  resolveVersionFromRange = (range: string) => {
    const rangeSet = new semver.Range(range).set
    return rangeSet[0][0].semver.version
  }

  setSelectedPackages = () => {
    const checkedInputs =
      this.packageSelectionContainerRef.current?.querySelectorAll<HTMLInputElement>(
        'input:checked'
      ) ?? []

    const selectedPackages = Array.from(checkedInputs).map(({ value }) => {
      const [name, resolvedVersion] = value.split('#')
      return { name, resolvedVersion }
    })

    this.setState(
      {
        selectedPackages,
        selectedPackageValues: Array.from(checkedInputs).map(
          ({ value }) => value
        ),
      },
      this.persistScanState
    )
  }

  handleSelectionChange = () => {
    this.setSelectedPackages()
  }

  getParsedPackages(json: ParsedPackageJson): ScannablePackage[] {
    const dependencies = json.dependencies ?? {}

    return Object.keys(dependencies)
      .filter(packageName => {
        const versionRange = dependencies[packageName]
        return semver.valid(versionRange) || semver.validRange(versionRange)
      })
      .map(packageName => {
        const versionRange = dependencies[packageName]

        return {
          name: packageName,
          versionRange,
          resolvedVersion: this.resolveVersionFromRange(versionRange),
        }
      })
  }

  getUnsupportedPackageNames(json: ParsedPackageJson): string[] {
    const dependencies = json.dependencies ?? {}

    return Object.keys(dependencies).filter(packageName => {
      const versionRange = dependencies[packageName]
      return !semver.valid(versionRange) && !semver.validRange(versionRange)
    })
  }

  handleDropAccepted = ([file]: File[]) => {
    if (!file) {
      this.showInvalidFileError()
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const result =
          typeof reader.result === 'string'
            ? reader.result
            : reader.result
            ? new TextDecoder().decode(reader.result)
            : ''
        const json = JSON.parse(result) as ParsedPackageJson
        const packages = this.getParsedPackages(json)
        const unsupportedPackageNames = this.getUnsupportedPackageNames(json)

        this.setState(
          {
            packages,
            unsupportedPackageNames,
            selectedPackageValues: packages
              .filter(
                ({ name }) => !scanBlacklist.some(regex => regex.test(name))
              )
              .map(({ name, resolvedVersion }) => `${name}#${resolvedVersion}`),
          },
          this.setSelectedPackages
        )
        Analytics.scanPackageJsonDropped(packages.length)
      } catch (err) {
        console.error(err)
        this.showInvalidFileError()
      }
    }

    try {
      reader.readAsText(file)
    } catch (err) {
      console.error(err)
      this.showInvalidFileError()
    }
  }

  handleDropRejected = () => {
    this.showInvalidFileError()
  }

  handleScanClick = () => {
    const { selectedPackages } = this.state
    if (selectedPackages.length === 0) {
      return
    }

    const query = selectedPackages
      .map(pack => `${pack.name}@${pack.resolvedVersion}`)
      .join(',')

    Router.push(`/scan-results?packages=${query}`)
    Analytics.performedScan()
  }

  handleResetClick = () => {
    this.setState(
      {
        packages: null,
        selectedPackages: [],
        selectedPackageValues: [],
        unsupportedPackageNames: [],
      },
      this.persistScanState
    )
  }

  showInvalidFileError() {
    alert('Could not parse the `package.json` file.')
    Analytics.scanParseError()
  }

  render() {
    const {
      packages,
      selectedPackages,
      selectedPackageValues,
      unsupportedPackageNames,
    } = this.state
    let content: React.ReactNode

    if (!packages) {
      content = (
        <div>
          <Dropzone
            className="scan__dropzone"
            onDropAccepted={this.handleDropAccepted}
            onDropRejected={this.handleDropRejected}
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
      )
    } else {
      content = (
        <div>
          <header className="scan__selection-header">
            <h1 className="scan__page-title"> Select packages to scan </h1>
            <button
              className="scan__btn"
              disabled={selectedPackages.length === 0}
              onClick={this.handleScanClick}
            >
              Scan {selectedPackages.length} packages
            </button>
            <button className="scan__btn" onClick={this.handleResetClick}>
              Reset
            </button>
          </header>
          {unsupportedPackageNames.length > 0 && (
            <p className="scan__unsupported-packages">
              Skipped {unsupportedPackageNames.length}{' '}
              {unsupportedPackageNames.length === 1
                ? 'dependency'
                : 'dependencies'}{' '}
              with unsupported version specifications:{' '}
              {unsupportedPackageNames.join(', ')}
            </p>
          )}
          <ul
            className="scan__package-container"
            ref={this.packageSelectionContainerRef}
          >
            {packages.map(({ name, versionRange, resolvedVersion }) => (
              <li className="scan__package-item" key={name}>
                <label>
                  <input
                    type="checkbox"
                    defaultChecked={selectedPackageValues.includes(
                      `${name}#${resolvedVersion}`
                    )}
                    value={`${name}#${resolvedVersion}`}
                    onChange={this.handleSelectionChange}
                  />
                  <span className="scan__package-item-title">
                    <span>{name}</span>
                    <span className="scan__package-item-version">
                      {versionRange} &rarr; {resolvedVersion}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selectedPackages.length === 0 && (
            <p className="scan__empty-selection">
              Select at least one package to start a scan.
            </p>
          )}
        </div>
      )
    }

    return (
      <ResultLayout className="scan-page">
        <MetaTags
          title="Scan package.json ❘ Bundlephobia"
          canonicalPath="/scan"
          description="Scan dependencies in your package.json to find the largest and heaviest npm packages in your frontend javascript bundle."
        />
        {content}
      </ResultLayout>
    )
  }
}
