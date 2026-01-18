import NetworkTree from 'pages/tree/components/NetworkTree'
import React, { PureComponent } from 'react'
import Analytics from 'react-ga'
import Head from 'next/head'

import ResultLayout from 'client/components/ResultLayout'
import AutocompleteInput from 'client/components/AutocompleteInput'
import AutocompleteInputBox from 'client/components/AutocompleteInputBox'
import Router, { withRouter } from 'next/router'
import { parsePackageString, resolveVersionFromRange } from 'utils/common.utils'

import API from 'client/api'

import './TreePage.scss'

class TreePage extends PureComponent {
  state = {
    nodes: [],
    links: [],
  }

  componentDidMount() {
    const {
      router: { query },
    } = this.props

    if (query.p && query.p.trim()) {
      this.handleSearchSubmit(query.p)
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const {
      router: { query },
    } = this.props
    const {
      url: { query: nextQuery },
    } = nextProps

    if (!nextQuery || !nextQuery.p.trim()) {
      return
    }

    const currentPackage = parsePackageString(query.p)
    const nextPackage = parsePackageString(nextQuery.p)

    if (currentPackage.name !== nextPackage.name) {
      this.handleSearchSubmit(nextQuery.p)
    }
  }

  buildDependencyTree = packageString => {
    console.log('processing', packageString)
    const processDependency = dep => {
      const nodeHasDep = this.state.nodes.find(
        node => node.name === dep.name && node.version === dep.version
      )
      const depString = `${dep.name}@${dep.version}`
      console.log('adding ', { source: packageString, target: depString })

      if (nodeHasDep) {
        this.setState({
          links: this.state.links.concat([
            { source: packageString, target: depString },
          ]),
        })
      } else {
        this.setState({
          nodes: this.state.nodes.concat([
            {
              ...dep,
              packageString: depString,
            },
          ]),
          links: this.state.links.concat([
            { source: packageString, target: depString },
          ]),
        })

        this.buildDependencyTree(depString)
      }
    }

    API.getDependencies(packageString).then(dependencies => {
      dependencies.forEach(processDependency)
    })
  }

  fetchResults = packageString => {
    this.setState({
      nodes: [{ name: packageString, version: null, packageString }],
    })
    this.buildDependencyTree(packageString)
  }

  handleSearchSubmit = packageString => {
    this.fetchResults(packageString)
  }

  getMetaTags = () => {
    const { router } = this.props
    const { resultsPromiseState, results } = this.state
    let name, version

    if (resultsPromiseState === 'fulfilled') {
      name = results.name
      version = results.version
    } else {
      name = parsePackageString(router.query.p).name
      version = parsePackageString(router.query.p).version
    }

    const packageString = version ? `${name}@${version}` : name
    const origin =
      typeof window === 'undefined'
        ? 'https://bundlephobia.com'
        : window.location.origin

    return (
      <Head>
        <meta
          property="og:title"
          key="og:title"
          content={`${packageString} ❘ Bundlephobia`}
        />
        <title key="title">{packageString} | Bundlephobia</title>
        <meta
          property="og:image"
          key="og:image"
          content={
            origin +
            `/api/stats-image?name=${name}&version=${version}&wide=true`
          }
        />
        <meta
          property="twitter:title"
          key="twitter:title"
          content={`${name} v${version} ❘ Bundlephobia`}
        />
        {name && version && (
          <meta
            name="twitter:card"
            key="twitter:card"
            content="summary_large_image"
          />
        )}
      </Head>
    )
  }

  render() {
    const { inputInitialValue, nodes, links } = this.state

    return (
      <ResultLayout>
        {/*{this.getMetaTags()}*/}
        <section className="content-container-wrap">
          <div className="content-container">
            <AutocompleteInputBox>
              <AutocompleteInput
                key={inputInitialValue}
                initialValue={inputInitialValue}
                className="result-page__search-input"
                onSearchSubmit={this.handleSearchSubmit}
              />
            </AutocompleteInputBox>
          </div>
          <div className="tree-page__network-tree-container">
            <NetworkTree nodes={nodes} links={links} />
          </div>
        </section>
      </ResultLayout>
    )
  }
}

export default withRouter(TreePage)
