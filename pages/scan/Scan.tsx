import Router, { withRouter, type NextRouter } from 'next/router'
import React, { Component, createRef } from 'react'
import Dropzone from 'react-dropzone'
import * as semver from 'semver'

import Analytics from '../../client/analytics'
import MetaTags from '../../client/components/MetaTags'
import ResultLayout from '../../client/components/ResultLayout'
import Separator from '../../client/components/Separator'
import scanBlacklist from '../../client/config/scanBlacklist'
import { normalizePackageJsonUrl } from '../../utils/common.utils'

type PackageJsonDependencies = Record<string, string>

type ParsedPackageJson = {
  dependencies?: PackageJsonDependencies
  devDependencies?: PackageJsonDependencies
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

type ScanProps = {
  router: NextRouter
}

type ScanState = {
  packages: ScannablePackage[] | null
  selectedPackages: SelectedPackage[]
  selectedPackageValues: string[]
  unsupportedPackageNames: string[]
  remoteUrlInput: string
  isLoadingRemoteUrl: boolean
  remoteUrlError: string | null
}

type PersistedScanState = {
  packages: ScannablePackage[]
  selectedPackageValues: string[]
  unsupportedPackageNames: string[]
}

const persistedScanStateKey = 'bundlephobia.scan-state'

class Scan extends Component<ScanProps, ScanState> {
  state: ScanState = {
    packages: null,
    selectedPackages: [],
    selectedPackageValues: [],
    unsupportedPackageNames: [],
    remoteUrlInput: '',
    isLoadingRemoteUrl: false,
    remoteUrlError: null,
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
    } else {
      const urlQuery = this.props.router?.query?.url
      if (urlQuery && typeof urlQuery === 'string') {
        this.setState({ remoteUrlInput: urlQuery })
        this.fetchRemotePackageJson(urlQuery)
      }
    }
  }

  componentDidUpdate(prevProps: ScanProps) {
    const currentUrl = this.props.router?.query?.url
    const prevUrl = prevProps.router?.query?.url

    if (
      currentUrl &&
      typeof currentUrl === 'string' &&
      currentUrl !== prevUrl &&
      !this.state.packages &&
      !this.state.isLoadingRemoteUrl
    ) {
      this.setState({ remoteUrlInput: currentUrl })
      this.fetchRemotePackageJson(currentUrl)
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
    const dependencies = {
      ...(json.dependencies ?? {}),
      ...(json.devDependencies ?? {}),
    }

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
    const dependencies = {
      ...(json.dependencies ?? {}),
      ...(json.devDependencies ?? {}),
    }

    return Object.keys(dependencies).filter(packageName => {
      const versionRange = dependencies[packageName]
      return !semver.valid(versionRange) && !semver.validRange(versionRange)
    })
  }

  fetchRemotePackageJson = async (inputUrl: string) => {
    if (!inputUrl.trim()) return

    const normalizedUrl = normalizePackageJsonUrl(inputUrl)
    this.setState({ isLoadingRemoteUrl: true, remoteUrlError: null })

    try {
      const response = await fetch(normalizedUrl)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch package.json (${response.status} ${response.statusText})`
        )
      }

      const json = (await response.json()) as ParsedPackageJson
      if (
        !json ||
        typeof json !== 'object' ||
        (!json.dependencies && !json.devDependencies)
      ) {
        throw new Error('Fetched file does not contain a dependencies block.')
      }

      const packages = this.getParsedPackages(json)
      const unsupportedPackageNames = this.getUnsupportedPackageNames(json)

      if (packages.length === 0) {
        throw new Error('No valid dependencies found in fetched package.json.')
      }

      this.setState(
        {
          packages,
          unsupportedPackageNames,
          selectedPackageValues: packages
            .filter(
              ({ name }) => !scanBlacklist.some(regex => regex.test(name))
            )
            .map(({ name, resolvedVersion }) => `${name}#${resolvedVersion}`),
          isLoadingRemoteUrl: false,
        },
        this.setSelectedPackages
      )
      Analytics.scanPackageJsonDropped(packages.length)
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Could not fetch or parse the package.json file.'
      this.setState({
        remoteUrlError: errorMessage,
        isLoadingRemoteUrl: false,
      })
      Analytics.scanParseError()
    }
  }

  handleRemoteUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    this.fetchRemotePackageJson(this.state.remoteUrlInput)
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
        remoteUrlError: null,
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
      remoteUrlInput,
      isLoadingRemoteUrl,
      remoteUrlError,
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
          <div className="scan__url-container">
            <Separator />
            <p className="scan__url-title">
              Or fetch from a URL / GitHub repository:
            </p>
            <form
              className="scan__url-form"
              onSubmit={this.handleRemoteUrlSubmit}
            >
              <input
                type="text"
                className="scan__url-input"
                placeholder="e.g. github.com/facebook/react or raw package.json URL"
                value={remoteUrlInput}
                onChange={e =>
                  this.setState({ remoteUrlInput: e.target.value })
                }
                disabled={isLoadingRemoteUrl}
              />
              <button
                type="submit"
                className="scan__btn scan__url-btn"
                disabled={isLoadingRemoteUrl || !remoteUrlInput.trim()}
              >
                {isLoadingRemoteUrl ? 'Fetching...' : 'Fetch'}
              </button>
            </form>
            {remoteUrlError && (
              <p className="scan__url-error">{remoteUrlError}</p>
            )}
          </div>
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

export default withRouter(Scan)
