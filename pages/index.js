import React, { PureComponent } from 'react'
import AutocompleteInput from 'client/components/AutocompleteInput'
import Layout from 'client/components/Layout'
import Router from 'next/router'
import Link from 'next/link'
import Analytics from 'react-ga'
import './index.scss'
import AutocompleteInputBox from 'client/components/AutocompleteInputBox/AutocompleteInputBox'

export default class Home extends PureComponent {
  componentDidMount() {
    Analytics.pageview(window.location.pathname)
  }

  handleSearchSubmit = value => {
    Analytics.event({
      category: 'Search',
      action: 'Searched',
      label: value.trim().replace(/@/g, '[at]'),
    })

    Router.push(`/result?p=${value.trim()}`)
  }

  render() {
    return (
      <Layout className="homepage">
        <div className="homepage__container">
          <svg
            className="logo-graphic"
            width="137"
            height="157"
            viewBox="0 0 137 157"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g stroke="#000" strokeWidth="1.5" fill="none" fillRule="evenodd">
              <g transform="translate(37.21 45.73)">
                <rect
                  fill="#C0C0C0"
                  x="25.1"
                  y="56.58"
                  width="16.74"
                  height="15.94"
                  rx="7.97"
                />
                <rect
                  x="25.1"
                  y="40.64"
                  width="16.74"
                  height="31.88"
                  rx="8.37"
                />
                <ellipse cx="7.13" cy="8.49" rx="7.13" ry="8.45" />
                <ellipse cx="56.54" cy="8.49" rx="7.13" ry="8.45" />
              </g>
              <g
                className="logo__skeleton-group"
                opacity=".15"
                transform="translate(104.153 25.807)"
              >
                <circle
                  className="logo__skeleton"
                  cx="23.51"
                  cy="4.78"
                  r="4.78"
                />
                <circle
                  className="logo__skeleton"
                  cx="6.18"
                  cy="87.47"
                  r="5.92"
                />
                <path
                  className="logo__skeleton"
                  d="M18.3 4.7l9.55.16m3.52 41.16L15 45.54m1.22-7.7L31.7 45.2"
                />
              </g>
              <path d="M114.1 117.84c1.2-1.02 1.74-1.96 2.48-3.56l19.3-42.92c-2.02-27.1-3.44-40.7-3.44-40.77 0-2.7-2.14-4.8-4.78-4.8-2.6 0-4.73 2.1-4.78 4.7l-3.05 37.7-14.76 42.1c-.44.8-.7 1.8-.7 2.8 0 .83.2 1.64.5 2.4l10.43 40.12 11.55-3.1-12.74-34.8z" />
              <path
                className="logo__skeleton"
                d="M104.97 112.06l10.7 2.98"
                opacity=".15"
              />
              <g
                className="logo__skeleton-group"
                opacity=".15"
                transform="matrix(-1 0 0 1 33.225 25.807)"
              >
                <circle
                  className="logo__skeleton"
                  cx="23.51"
                  cy="4.78"
                  r="4.78"
                />
                <circle
                  className="logo__skeleton"
                  cx="6.18"
                  cy="87.47"
                  r="5.92"
                />
                <path
                  className="logo__skeleton"
                  d="M18.3 4.7l9.55.16m3.52 41.16L15 45.54m1.22-7.7L31.7 45.2"
                />
              </g>
              <path d="M23.27 117.84c-1.2-1.02-1.73-1.96-2.47-3.56L1.5 71.36c2.02-27.1 3.43-40.7 3.43-40.77 0-2.7 2.14-4.8 4.8-4.8 2.6 0 4.72 2.1 4.77 4.7l3.05 37.7 14.75 42.2c.45.8.7 1.8.7 2.8 0 .8-.18 1.6-.5 2.4l-10.4 40.1-11.55-3.1 12.74-34.8z" />
              <path
                className="logo__skeleton"
                d="M32.4 112.06l-10.7 2.98"
                opacity=".15"
              />
              <path d="M94.26 91.23c12.2-7.54 20.25-20.38 20.25-34.94 0-3.9-.5-7.6-1.5-11.1C112.8 21 93.2 1.5 68.98 1.5S25 21.02 24.87 45.2c-1.05 3.52-1.6 7.23-1.6 11.05 0 16.54 10.43 30.9 25.6 37.72-.1 1.4-.1 2.82-.1 4.26 0 23.22 10.22 42.04 22.9 42.04 12.65 0 22.92-18.8 22.92-42.03 0-2.4-.2-4.8-.4-7.1z" />
              <g
                className="logo__skeleton-group"
                opacity=".15"
                transform="translate(23.263 1.5)"
              >
                <circle
                  className="logo__skeleton"
                  cx="45.63"
                  cy="44.03"
                  r="44.03"
                />
                <ellipse
                  className="logo__skeleton"
                  cx="45.63"
                  cy="54.79"
                  rx="45.62"
                  ry="42.04"
                />
                <ellipse
                  className="logo__skeleton"
                  cx="48.39"
                  cy="96.83"
                  rx="22.93"
                  ry="42.04"
                />
              </g>
            </g>
          </svg>
          <div className="logo">
            <span>Bundle</span>
            <span className="logo__alt">Phobia</span>
          </div>
          <h1 className="homepage__tagline">
            find the cost of adding a npm package to your bundle
          </h1>
          <AutocompleteInputBox className="homepage__search-input">
            <AutocompleteInput
              containerClass="homepage__search-input-container"
              onSearchSubmit={this.handleSearchSubmit}
              autoFocus={true}
            />
          </AutocompleteInputBox>
          <div className="homepage__or-divider">or</div>
          <div className="homepage__scan-link">
            <Link href="/scan">
              <a>
                <span>
                  Scan a <code>package.json</code> file
                </span>
                &nbsp;
                <sup>beta</sup>
              </a>
            </Link>
          </div>
        </div>
      </Layout>
    )
  }
}
