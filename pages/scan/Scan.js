import React, { Component } from 'react'
import Analytics from 'react-ga'
import ResultLayout from 'client/components/ResultLayout'
import Separator from 'client/components/Separator'
import scanBlacklist from '../../client/config/scanBlacklist'
import Dropzone from 'react-dropzone'
import Router from 'next/router'
import * as semver from 'semver'
import './Scan.scss'

export default class Scan extends Component {
  state = {
    packages: null,
    selectedPackages: [],
  }

  componentDidMount() {
    Analytics.pageview(window.location.pathname)
  }

  resolveVersionFromRange = range => {
    const rangeSet = new semver.Range(range).set
    return rangeSet[0][0].semver.version
  }

  setSelectedPackages = () => {
    const checkedInputs = this.packageSelectionContainer.querySelectorAll(
      'input:checked'
    )

    const selectedPackages = Array.from(checkedInputs).map(({ value }) => {
      const [name, resolvedVersion] = value.split('#')
      return { name, resolvedVersion }
    })

    this.setState({ selectedPackages })
  }

  handleSelectionChange = () => {
    this.setSelectedPackages()
  }

  handleDropAccepted = ([file]) => {
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
              resolvedVersion: this.resolveVersionFromRange(versionRange),
            }
          })

        this.setState({ packages }, this.setSelectedPackages)

        Analytics.event({
          category: 'scan',
          action: 'package.json dropped',
          value: packages.length,
        })
      } catch (err) {
        this.showInvalidFileError()
      }
    }

    try {
      reader.readAsBinaryString(file)
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

    Analytics.event({
      category: 'scan',
      action: 'scan clicked',
    })
  }

  handleResetClick = () => {
    this.setState({ packages: null, selectedPackages: [] })
  }

  showInvalidFileError() {
    alert('Could not parse the `package.json` file.')

    Analytics.exception({
      description: 'Could not parse the `package.json` file',
    })
  }

  render() {
    let content
    const { packages, selectedPackages } = this.state

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
            ref={pc => (this.packageSelectionContainer = pc)}
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
    return <ResultLayout className="scan-page">{content}</ResultLayout>
  }
}
