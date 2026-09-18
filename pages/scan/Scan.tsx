import Router, { withRouter, type NextRouter } from 'next/router'
import React, { Component, createRef } from 'react'
import Dropzone from 'react-dropzone'
import * as semver from 'semver'

import Analytics from '../../client/analytics'
import MetaTags from '../../client/components/MetaTags'
import ResultLayout from '../../client/components/ResultLayout'
import Separator from '../../client/components/Separator'
import { Button, IconButton } from '../../client/components/ui'
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
  isUrlFormOpen: boolean
}

type PersistedScanState = {
  packages: ScannablePackage[]
  selectedPackageValues: string[]
  unsupportedPackageNames: string[]
}

const persistedScanStateKey = 'bundlephobia.scan-state'

function remoteFetchError(error: Error): Error {
  return error.name === 'TypeError' || error.message.includes('Failed to fetch')
    ? new Error(
        'Network or CORS restriction prevented fetching this URL. Make sure the URL points to a public GitHub repo or raw JSON file with CORS enabled, or upload package.json manually.',
      )
    : error
}

function responseError(response: Response): Error {
  return response.status === 404
    ? new Error(
        'Could not find package.json at this URL (HTTP 404). Please check the repository link or upload manually.',
      )
    : new Error(
        `Failed to fetch package.json (HTTP ${response.status} ${response.statusText}).`,
      )
}

async function fetchPackageJson(url: string): Promise<ParsedPackageJson> {
  const response = await fetch(url).catch((error: Error) => {
    throw remoteFetchError(error)
  })

  if (!response.ok) throw responseError(response)

  let json: ParsedPackageJson

  try {
    // SAFETY: responseError only returns after the package JSON endpoint succeeds.
    json = (await response.json()) as ParsedPackageJson
  } catch {
    throw new Error(
      'The response from this URL is not valid JSON. Please check the link or upload package.json manually.',
    )
  }

  if (
    !json ||
    Object.prototype.toString.call(json) !== '[object Object]' ||
    (!json.dependencies && !json.devDependencies)
  ) {
    throw new Error(
      'Fetched package.json does not contain a dependencies or devDependencies block.',
    )
  }

  return json
}

function shouldFetchRouterUrl({
  currentUrl,
  previousUrl,
  hasPackages,
  isLoading,
}: {
  currentUrl: unknown
  previousUrl: unknown
  hasPackages: boolean
  isLoading: boolean
}) {
  return Boolean(
    currentUrl &&
    Object.prototype.toString.call(currentUrl) === '[object String]' &&
    currentUrl !== previousUrl &&
    !hasPackages &&
    !isLoading,
  )
}

function fetchableRouterUrl(options: {
  currentUrl: unknown
  previousUrl: unknown
  hasPackages: boolean
  isLoading: boolean
}): string | undefined {
  if (!shouldFetchRouterUrl(options)) return undefined

  return Object.prototype.toString.call(options.currentUrl) ===
    '[object String]'
    ? String(options.currentUrl)
    : undefined
}

class Scan extends Component<ScanProps, ScanState> {
  state: ScanState = {
    packages: null,
    selectedPackages: [],
    selectedPackageValues: [],
    unsupportedPackageNames: [],
    remoteUrlInput: '',
    isLoadingRemoteUrl: false,
    remoteUrlError: null,
    isUrlFormOpen: false,
  }

  private packageSelectionContainerRef = createRef<HTMLUListElement>()
  private dropzoneRef = createRef<Dropzone>()

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
        this.setSelectedPackages,
      )
    } else {
      const urlQuery = this.props.router?.query?.url

      if (urlQuery && !Array.isArray(urlQuery)) {
        this.setState({ remoteUrlInput: urlQuery, isUrlFormOpen: true })
        this.fetchRemotePackageJson(urlQuery)
      }
    }
  }

  componentDidUpdate(prevProps: ScanProps) {
    const currentUrl = this.props.router?.query?.url
    const prevUrl = prevProps.router?.query?.url

    const urlToFetch = fetchableRouterUrl({
      currentUrl,
      previousUrl: prevUrl,
      hasPackages: Boolean(this.state.packages),
      isLoading: this.state.isLoadingRemoteUrl,
    })

    if (urlToFetch) {
      this.setState({ remoteUrlInput: urlToFetch, isUrlFormOpen: true })
      this.fetchRemotePackageJson(urlToFetch)
    }
  }

  readPersistedScanState = (): PersistedScanState | null => {
    try {
      const serializedState = window.sessionStorage.getItem(
        persistedScanStateKey,
      )

      if (!serializedState) {
        return null
      }

      // SAFETY: this value was written by the scan-state serializer in this client.
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
          parsedState.unsupportedPackageNames,
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
        JSON.stringify(persistedState),
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
        'input:checked',
      ) ?? []

    const selectedPackages = Array.from(checkedInputs).map(({ value }) => {
      const [name, resolvedVersion] = value.split('#')

      return { name, resolvedVersion }
    })

    this.setState(
      {
        selectedPackages,
        selectedPackageValues: Array.from(checkedInputs).map(
          ({ value }) => value,
        ),
      },
      this.persistScanState,
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
    this.setState({
      isLoadingRemoteUrl: true,
      remoteUrlError: null,
      isUrlFormOpen: true,
    })

    try {
      const json = await fetchPackageJson(normalizedUrl)

      const packages = this.getParsedPackages(json)
      const unsupportedPackageNames = this.getUnsupportedPackageNames(json)

      if (packages.length === 0) {
        throw new Error(
          'No valid npm dependencies found in the fetched package.json file.',
        )
      }

      this.setState(
        {
          packages,
          unsupportedPackageNames,
          selectedPackageValues: packages
            .filter(
              ({ name }) => !scanBlacklist.some(regex => regex.test(name)),
            )
            .map(({ name, resolvedVersion }) => `${name}#${resolvedVersion}`),
          isLoadingRemoteUrl: false,
        },
        this.setSelectedPackages,
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
          Object.prototype.toString.call(reader.result) === '[object String]'
            ? String(reader.result)
            : reader.result instanceof ArrayBuffer
              ? new TextDecoder().decode(reader.result)
              : ''

        // SAFETY: the selected file is parsed as the package.json contract below.
        const json = JSON.parse(result) as ParsedPackageJson
        const packages = this.getParsedPackages(json)
        const unsupportedPackageNames = this.getUnsupportedPackageNames(json)

        this.setState(
          {
            packages,
            unsupportedPackageNames,
            selectedPackageValues: packages
              .filter(
                ({ name }) => !scanBlacklist.some(regex => regex.test(name)),
              )
              .map(({ name, resolvedVersion }) => `${name}#${resolvedVersion}`),
          },
          this.setSelectedPackages,
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
        isUrlFormOpen: false,
      },
      this.persistScanState,
    )
  }

  showInvalidFileError() {
    alert('Could not parse the `package.json` file.')
    Analytics.scanParseError()
  }

  renderUnsupportedPackages(packageNames: string[]) {
    if (packageNames.length === 0) return null

    return (
      <p className="scan__unsupported-packages">
        Skipped {packageNames.length}{' '}
        {packageNames.length === 1 ? 'dependency' : 'dependencies'} with
        unsupported version specifications: {packageNames.join(', ')}
      </p>
    )
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
      isUrlFormOpen,
    } = this.state

    let content: React.ReactNode

    if (packages) {
      content = (
        <div>
          <header className="scan__selection-header">
            <h1 className="scan__page-title"> Select packages to scan </h1>
            <Button
              className="scan__btn"
              disabled={selectedPackages.length === 0}
              onClick={this.handleScanClick}
              variant="primary"
            >
              Scan {selectedPackages.length} packages
            </Button>
            <Button
              className="scan__btn"
              onClick={this.handleResetClick}
              variant="primary"
            >
              Reset
            </Button>
          </header>
          {this.renderUnsupportedPackages(unsupportedPackageNames)}
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
                      `${name}#${resolvedVersion}`,
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
    } else {
      content = (
        <div>
          <Dropzone
            ref={this.dropzoneRef}
            className="scan__dropzone"
            onDropAccepted={this.handleDropAccepted}
            onDropRejected={this.handleDropRejected}
            multiple={false}
            accept="application/json"
          >
            {isUrlFormOpen === false ? (
              <>
                <p>
                  Drop a <code> package.json </code> file here
                </p>
                <Separator />
                <div
                  className="scan__dropzone-actions"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    className="scan__btn"
                    type="button"
                    variant="primary"
                    onClick={() => this.dropzoneRef.current?.open()}
                  >
                    Upload <code> package.json </code>
                  </Button>
                  <Button
                    className="scan__btn"
                    type="button"
                    variant="primary"
                    onClick={e => {
                      e.stopPropagation()
                      this.setState({
                        isUrlFormOpen: true,
                        remoteUrlError: null,
                      })
                    }}
                  >
                    Scan from URL / GitHub
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Fetch <code> package.json </code> from URL or GitHub
                </p>
                <Separator />
                <div
                  className="scan__url-form-wrapper"
                  onClick={e => e.stopPropagation()}
                >
                  <form
                    className="scan__url-form"
                    onSubmit={this.handleRemoteUrlSubmit}
                  >
                    <input
                      type="text"
                      aria-label="Package.json URL"
                      className="scan__url-input"
                      placeholder="e.g. github.com/facebook/react or raw package.json URL"
                      value={remoteUrlInput}
                      onChange={e =>
                        this.setState({ remoteUrlInput: e.target.value })
                      }
                      disabled={isLoadingRemoteUrl}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      className="scan__btn scan__url-btn"
                      variant="primary"
                      disabled={isLoadingRemoteUrl || !remoteUrlInput.trim()}
                    >
                      {isLoadingRemoteUrl ? 'Fetching...' : 'Fetch'}
                    </Button>
                    <IconButton
                      type="button"
                      className="scan__url-cancel-btn"
                      onClick={e => {
                        e.stopPropagation()
                        this.setState({
                          isUrlFormOpen: false,
                          remoteUrlError: null,
                          isLoadingRemoteUrl: false,
                        })
                      }}
                      label="Cancel and return to upload view"
                      variant="quiet"
                    >
                      ✕
                    </IconButton>
                  </form>

                  {remoteUrlError && (
                    <div className="scan__url-error-box">
                      <h4 className="scan__url-error-code">FetchError</h4>
                      <p className="scan__url-error-message">
                        {remoteUrlError}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </Dropzone>
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
