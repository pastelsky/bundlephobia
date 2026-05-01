import Router, { withRouter, type NextRouter } from 'next/router'
import React, { PureComponent } from 'react'

import API, { type PackageDependencyInfo } from 'client/api'
import AutocompleteInputBox from 'client/components/AutocompleteInputBox'
import ResultLayout from 'client/components/ResultLayout'
import { AutocompleteInput } from 'client/components/AutocompleteInput'
import { parsePackageString } from 'utils/common.utils'
import NetworkTree from './components/NetworkTree'

import './TreePage.scss'

type TreeNode = {
  name: string
  version: string | null
  packageString: string
}

type TreeLink = {
  source: string
  target: string
}

type TreePageProps = {
  router: NextRouter
}

type TreePageState = {
  nodes: TreeNode[]
  links: TreeLink[]
  inputInitialValue?: string
}

function getQueryValue(query: NextRouter['query'], key: string) {
  const value = query[key]
  return Array.isArray(value) ? value[0] : value
}

class TreePage extends PureComponent<TreePageProps, TreePageState> {
  state: TreePageState = {
    nodes: [],
    links: [],
  }

  componentDidMount() {
    const queryValue = getQueryValue(this.props.router.query, 'p')
    if (queryValue?.trim()) {
      this.handleSearchSubmit(queryValue)
    }
  }

  componentDidUpdate(prevProps: TreePageProps) {
    const currentQuery = getQueryValue(prevProps.router.query, 'p')
    const nextQuery = getQueryValue(this.props.router.query, 'p')

    if (!nextQuery?.trim()) {
      return
    }

    const currentPackage = parsePackageString(currentQuery ?? '')
    const nextPackage = parsePackageString(nextQuery)

    if (currentPackage.name !== nextPackage.name) {
      this.handleSearchSubmit(nextQuery)
    }
  }

  buildDependencyTree = (packageString: string) => {
    const processDependency = (dep: PackageDependencyInfo) => {
      const nodeHasDep = this.state.nodes.find(
        node => node.name === dep.name && node.version === dep.version
      )
      const depString = `${dep.name}@${dep.version}`

      if (nodeHasDep) {
        this.setState(currentState => ({
          links: currentState.links.concat([
            { source: packageString, target: depString },
          ]),
        }))
      } else {
        this.setState(
          currentState => ({
            nodes: currentState.nodes.concat([
              {
                ...dep,
                packageString: depString,
              },
            ]),
            links: currentState.links.concat([
              { source: packageString, target: depString },
            ]),
          }),
          () => {
            this.buildDependencyTree(depString)
          }
        )
      }
    }

    API.getDependencies(packageString).then(dependencies => {
      dependencies.forEach(processDependency)
    })
  }

  fetchResults = (packageString: string) => {
    this.setState({
      nodes: [{ name: packageString, version: null, packageString }],
      links: [],
      inputInitialValue: packageString,
    })
    this.buildDependencyTree(packageString)
  }

  handleSearchSubmit = (packageString: string) => {
    this.fetchResults(packageString)
    Router.push(`/tree?p=${packageString}`)
  }

  render() {
    const { inputInitialValue, nodes, links } = this.state

    return (
      <ResultLayout>
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
