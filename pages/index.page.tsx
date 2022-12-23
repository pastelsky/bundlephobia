import React from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

import Analytics from '../client/analytics'
import { AutocompleteInput } from '../client/components/AutocompleteInput'
import AutocompleteInputBox from '../client/components/AutocompleteInputBox/AutocompleteInputBox'
import Layout from '../client/components/Layout'
import MetaTags from '../client/components/MetaTags'
import PageNav from '../client/components/PageNav'
import cx from 'classnames'

import { Press_Start_2P } from '@next/font/google'

const pressStart2P = Press_Start_2P({ weight: '400', subsets: ['latin'] })

const LogoChristmas = () => (
  <svg
    className="logo-graphic logo-graphic-christmas"
    width="137"
    height="157"
    viewBox="0 0 772 929"
  >
    <g fill="none" fill-rule="evenodd">
      <path
        stroke="#000"
        stroke-width="7"
        d="M476 664.5c45.7 0 87.08 18.52 117.03 48.47A164.98 164.98 0 0 1 641.5 830v95.5h-601V830c0-45.7 18.52-87.08 48.47-117.03A164.98 164.98 0 0 1 206 664.5Z"
      />
      <path
        fill="#F9523C"
        stroke="#000"
        stroke-width="7"
        d="m508.7 53.06 184.36 79.06-8.75 48.71-100.99-9.16c-10.25-40.82-31.45-76.96-63.62-108.43a274.59 274.59 0 0 0-10.65-9.89l-.34-.3Z"
      />
      <path
        stroke="#000"
        stroke-width="7"
        d="M178.14 53.17c42.27-33.72 97.9-50.2 166.83-49.66 68.92.55 123.98 17.65 165.1 51.53 40.26 33.17 67.08 82.37 80.65 147.46l-498.3-.98c15.8-65.84 44.32-115.33 85.72-148.35Z"
      />
      <circle
        cx="720"
        cy="160"
        r="48.5"
        fill="#FFF"
        stroke="#000"
        stroke-width="7"
      />
      <path
        stroke="#000"
        stroke-width="7"
        d="m267.5 854.58 143.3 3.26v67.66H267.5v-70.92Z"
      />
      <path
        fill="#F9523C"
        stroke="#000"
        stroke-width="5"
        d="M358 901.5a7.48 7.48 0 0 1 7.5 7.5v17.5h-49V909a7.48 7.48 0 0 1 7.5-7.5Z"
      />
      <path
        fill="#FFF"
        stroke="#000"
        stroke-width="7"
        d="M602.5 310.5v255.83h25.68c-5.42 100.7-31.32 176.13-78.02 226.15-47.12 50.47-115.38 74.86-204.6 73.51l-5.48-.11c-91.08-2.42-160.9-28.73-209.31-79.23-47.89-49.95-74.75-123.45-80.9-220.32H79.5V310.5h523Z"
      />
      <path
        stroke="#000"
        stroke-width="7"
        d="M614 377.5c17.26 0 32.88 7 44.2 18.3a62.3 62.3 0 0 1 18.3 44.2c0 17.26-7 32.88-18.3 44.2a62.3 62.3 0 0 1-44.2 18.3h-11.5v-28h3.02c9.43 0 17.97-3.78 24.2-9.9a34.4 34.4 0 0 0 10.3-24.05v-.54a34.4 34.4 0 0 0-10.1-24.4 34.4 34.4 0 0 0-24.4-10.11h-3.02v-28Z"
      />
      <path
        fill="#F9523C"
        stroke="#000"
        stroke-width="7"
        d="M473.67 400.06c0-8.5 3.4-16.18 8.9-21.74a30.05 30.05 0 0 1 42.86 0 30.82 30.82 0 0 1 8.9 21.74 4.26 4.26 0 0 1-4.27 4.27h-3.85a5.75 5.75 0 0 1-5.77-5.56 14.2 14.2 0 0 0-4.61-10.75 18.77 18.77 0 0 0-11.83-4.69c-3 0-7.38 1.12-10.57 4.02a13.16 13.16 0 0 0-4.32 9.76c0 2.11-.75 3.91-2 5.2a6.62 6.62 0 0 1-4.78 2.02h-4.39a4.26 4.26 0 0 1-4.27-4.27Zm-312-1c0-8.5 3.4-16.18 8.9-21.74a30.05 30.05 0 0 1 42.86 0 30.82 30.82 0 0 1 8.9 21.74 4.26 4.26 0 0 1-4.27 4.27h-3.85a5.75 5.75 0 0 1-5.77-5.56 14.2 14.2 0 0 0-4.61-10.75 18.77 18.77 0 0 0-11.83-4.69c-3 0-7.38 1.12-10.57 4.02a13.16 13.16 0 0 0-4.32 9.76c0 2.11-.75 3.91-2 5.2a6.62 6.62 0 0 1-4.78 2.02h-4.39a4.26 4.26 0 0 1-4.27-4.27Z"
      />
      <path
        stroke="#000"
        stroke-width="7"
        d="M578.5 313.5V469c0 30.16-11.36 57.66-30.03 78.46a117.27 117.27 0 0 1-70.97 37.9V559.5c0-37.56-15.22-71.56-39.83-96.17a135.57 135.57 0 0 0-96.17-39.83 135.57 135.57 0 0 0-96.17 39.83 135.57 135.57 0 0 0-39.83 96.17v25.85a117.27 117.27 0 0 1-70.96-37.89A117.06 117.06 0 0 1 104.5 469V313.5h474ZM66 378.5a62.3 62.3 0 0 0-44.2 18.3A62.3 62.3 0 0 0 3.5 441c0 17.26 7 32.88 18.3 44.2A62.3 62.3 0 0 0 66 503.5h11.5v-28h-3.02a34.39 34.39 0 0 1-24.2-9.9 34.4 34.4 0 0 1-10.3-24.05v-.54a34.4 34.4 0 0 1 10.1-24.4 34.4 34.4 0 0 1 24.4-10.11h3.02v-28Z"
      />
      <path
        fill="#FFF"
        stroke="#000"
        stroke-width="7"
        d="M590 201.5c15.05 0 28.68 6.1 38.54 15.96A54.33 54.33 0 0 1 644.5 256v4c0 15.05-6.1 28.67-15.96 38.54A54.33 54.33 0 0 1 590 314.5h-71.78a20.82 20.82 0 0 1-5.6 18.02 19.7 19.7 0 0 1-24.57 2.96 20.42 20.42 0 0 1-7.41-8.25l-3.14-6.36-3.14 6.36a20.42 20.42 0 0 1-7.41 8.25 19.7 19.7 0 0 1-24.56-2.96 20.82 20.82 0 0 1-5.6-18.02H259.21a20.82 20.82 0 0 1-5.6 18.02 19.7 19.7 0 0 1-24.57 2.96 20.42 20.42 0 0 1-7.41-8.25l-3.14-6.36-3.14 6.36a20.42 20.42 0 0 1-7.41 8.25 19.7 19.7 0 0 1-24.56-2.96 20.82 20.82 0 0 1-5.6-18.02H103a54.33 54.33 0 0 1-38.54-15.96A54.33 54.33 0 0 1 48.5 260v-4c0-15.05 6.1-28.67 15.96-38.54A54.33 54.33 0 0 1 103 201.5Z"
      />
      <rect
        width="57"
        height="176"
        x="312.5"
        y="361.5"
        fill="#FFF"
        stroke="#000"
        stroke-width="7"
        rx="28.5"
      />
      <rect
        width="57"
        height="107"
        x="312.5"
        y="558.5"
        stroke="#000"
        stroke-width="7"
        rx="28.5"
      />
      <path
        stroke="#BCBCBC"
        stroke-width="7"
        d="M290.6 592c-23.07 70.33-57.7 105.5-103.88 105.5-46.19 0-74.6-24.48-85.22-73.44m290-32.06c23.06 70.33 57.7 105.5 103.88 105.5 46.19 0 74.6-24.48 85.22-73.44M123.44 729.5c36.38 45.24 79.65 63.84 129.82 55.8 50.17-8.06 79.6-47.46 88.3-118.23m219 62.43c-36.38 45.24-79.65 63.84-129.82 55.8-50.17-8.06-79.6-47.46-88.3-118.23"
      />
      <path
        stroke="#BCBCBC"
        stroke-width="7"
        d="M340.56 670.07c3.52 66.34 3 110.2-1.56 131.58-4.56 21.39-17.5 38.86-38.78 52.41"
      />
      <path
        fill="#F9523C"
        stroke="#000"
        stroke-width="7"
        d="M341.39 630.1h.46c8.34.1 17.42 4.03 27.31 11.48-1.49 7.07-4.2 12.6-8.27 16.51-4.4 4.2-10.33 6.45-17.72 6.92-7.3.46-13.34-1.3-18.07-5.45-4.54-3.99-7.85-10.07-10.08-18.13 9.64-7.54 18.55-11.43 26.83-11.32Z"
      />
      <path
        stroke="#BCBCBC"
        stroke-width="7"
        d="M341.56 683.7c1.78 57.25 4.95 96.57 9.52 117.95 4.56 21.39 17.49 39.2 38.78 53.41"
      />
    </g>
  </svg>
)

const Logo = () => (
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
        <rect x="25.1" y="40.64" width="16.74" height="31.88" rx="8.37" />
        <ellipse cx="7.13" cy="8.49" rx="7.13" ry="8.45" />
        <ellipse cx="56.54" cy="8.49" rx="7.13" ry="8.45" />
      </g>
      <g
        className="logo__skeleton-group"
        opacity=".15"
        transform="translate(104.153 25.807)"
      >
        <circle className="logo__skeleton" cx="23.51" cy="4.78" r="4.78" />
        <circle className="logo__skeleton" cx="6.18" cy="87.47" r="5.92" />
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
        <circle className="logo__skeleton" cx="23.51" cy="4.78" r="4.78" />
        <circle className="logo__skeleton" cx="6.18" cy="87.47" r="5.92" />
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
        <circle className="logo__skeleton" cx="45.63" cy="44.03" r="44.03" />
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
)

const Home = () => {
  const router = useRouter()

  React.useEffect(() => {
    Analytics.pageView('home')
  }, [])

  const handleSearchSubmit = (value: string) => {
    Analytics.performedSearch(value.trim())
    router.push(`/package/${value.trim()}`)
  }

  return (
    <Layout className="homepage">
      <MetaTags
        title="Bundlephobia | Size of npm dependencies"
        canonicalPath=""
      />
      <div className="homepage__container">
        <PageNav minimal={true} />
        <div className="homepage__content">
          <LogoChristmas />
          <div className={cx('logo', pressStart2P.className)}>
            <span>Bundle</span>
            <span className="logo__alt">Phobia</span>
          </div>
          <h1 className="homepage__tagline">
            find the cost of adding a npm package to your bundle
          </h1>
          <AutocompleteInputBox className="homepage__search-input">
            <AutocompleteInput
              containerClass="homepage__search-input-container"
              onSearchSubmit={handleSearchSubmit}
              autoFocus={true}
            />
          </AutocompleteInputBox>
          <div className="homepage__or-divider">or</div>
          <div className="homepage__scan-link">
            <Link href="/scan">
              <span>
                Scan a <code>package.json</code> file
              </span>
              &nbsp;
              <sup>beta</sup>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Home
