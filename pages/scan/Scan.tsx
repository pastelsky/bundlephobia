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
}

export default class Scan extends Component<Record<string, never>, ScanState> {
  state: ScanState = {
    packages: null,
    selectedPackages: [],
  }

  private packageSelectionContainerRef = createRef<HTMLUListElement>()

  componentDidMount() {
    Analytics.pageView('scan')
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

    this.setState({ selectedPackages })
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

        this.setState({ packages }, this.setSelectedPackages)
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
    const query = selectedPackages
      .map(pack => `${pack.name}@${pack.resolvedVersion}`)
      .join(',')

    Router.push(`/scan-results?packages=${query}`)
    Analytics.performedScan()
  }

  handleResetClick = () => {
    this.setState({ packages: null, selectedPackages: [] })
  }

  showInvalidFileError() {
    alert('Could not parse the `package.json` file.')
    Analytics.scanParseError()
  }

  render() {
    const { packages, selectedPackages } = this.state
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
            <button className="scan__btn" onClick={this.handleScanClick}>
              Scan {selectedPackages.length} packages
            </button>
            <button className="scan__btn" onClick={this.handleResetClick}>
              Reset
            </button>
          </header>
          <ul
            className="scan__package-container"
            ref={this.packageSelectionContainerRef}
          >
            {packages.map(({ name, versionRange, resolvedVersion }) => (
              <li className="scan__package-item" key={name}>
                <label>
                  <input
                    type="checkbox"
                    defaultChecked={
                      !scanBlacklist.some(regex => regex.test(name))
                    }
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

export const getServerSideProps = () => {
  return { props: {} }
}
