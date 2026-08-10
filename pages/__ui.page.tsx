import React, { useState } from 'react'
import { GetServerSideProps } from 'next'

import Layout from '../client/components/Layout'
import PageNav from '../client/components/PageNav'
import {
  BrandLogo,
  Button,
  Checkbox,
  IconButton,
  Popover,
  ToggleGroup,
  Tooltip,
} from '../client/components/ui'

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === 'production') return { notFound: true }
  return { props: {} }
}

export default function UiCatalogPage() {
  const [checked, setChecked] = useState(true)
  const [selection, setSelection] = useState('first')

  return (
    <Layout className="ui-catalog">
      <div className="ui-catalog__container">
        <PageNav variant="full" />
        <main className="ui-catalog__content">
          <header>
            <p className="ui-catalog__eyebrow">Development only</p>
            <h1>Bundlephobia UI</h1>
            <p>Foundation tokens and shared component states.</p>
          </header>

          <section className="ui-catalog__section">
            <h2>Foundation</h2>
            <div className="ui-catalog__tokens">
              {['page', 'surface', 'text', 'action', 'focus'].map(token => (
                <div
                  key={token}
                  className={`ui-catalog__swatch ui-catalog__swatch--${token}`}
                >
                  {token}
                </div>
              ))}
            </div>
            <div className="ui-catalog__type">
              <BrandLogo /> <code>Package name@1.0.0</code>
            </div>
          </section>

          <section className="ui-catalog__section">
            <h2>Actions</h2>
            <div className="ui-catalog__row">
              <Button variant="primary">Build package</Button>
              <Button>Secondary action</Button>
              <Button variant="quiet">Quiet action</Button>
              <Button variant="danger">Remove</Button>
              <Button disabled>Disabled</Button>
              <IconButton label="Example icon action" variant="quiet">
                ×
              </IconButton>
            </div>
          </section>

          <section className="ui-catalog__section">
            <h2>Selection and overlays</h2>
            <div className="ui-catalog__row">
              <Checkbox
                checked={checked}
                onCheckedChange={setChecked}
                label="Tree-shakeable"
              />
              <ToggleGroup
                aria-label="Example choice"
                value={selection}
                onValueChange={setSelection}
                options={[
                  { value: 'first', label: 'Minified' },
                  { value: 'second', label: 'Gzip' },
                ]}
              />
              <Popover
                label="Open example popover"
                trigger={<Button>Open menu</Button>}
              >
                <strong>Shared popover</strong>
                <p>Uses Base UI positioning and dismissal behavior.</p>
              </Popover>
              <Tooltip content="A Base UI tooltip">
                <Button variant="quiet">Hover help</Button>
              </Tooltip>
            </div>
          </section>

          <section className="ui-catalog__section">
            <h2>Header variants</h2>
            <div className="ui-catalog__header-demo">
              <PageNav variant="landing" />
            </div>
            <div className="ui-catalog__header-demo">
              <PageNav variant="focused" />
            </div>
          </section>
        </main>
      </div>
    </Layout>
  )
}
