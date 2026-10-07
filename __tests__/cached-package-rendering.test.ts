import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GetServerSidePropsContext } from 'next'
import type { NextRouter } from 'next/router'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'

import ResultPage, {
  getServerSideProps,
} from '../pages/package/[...packageString]/ResultPage'
import CacheServiceClient from '../server/clients/cache-service.client'

const result = {
  name: 'cached-library',
  version: '1.2.3',
  size: 12345,
  gzip: 4567,
  description: 'Useful <img src=x onerror=alert(1)> package',
  repository: '',
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: false,
  hasJSNext: false,
  isModuleType: false,
}

function context(userAgent = 'Googlebot'): GetServerSidePropsContext {
  const req = Object.assign(new IncomingMessage(new Socket()), { cookies: {} })
  req.headers['user-agent'] = userAgent

  return {
    params: { packageString: ['cached-library@1.2.3'] },
    req,
    res: new ServerResponse(req),
    query: {},
    resolvedUrl: '/package/cached-library@1.2.3',
  }
}

function router(): NextRouter {
  return {
    basePath: '',
    pathname: '/package/[...packageString]',
    route: '/package/[...packageString]',
    query: { packageString: ['cached-library@1.2.3'] },
    asPath: '/package/cached-library@1.2.3',
    isReady: true,
    isFallback: false,
    isPreview: false,
    push: async () => true,
    replace: async () => true,
    prefetch: async () => {},
    reload: () => {},
    back: () => {},
    forward: () => {},
    beforePopState: () => {},
    events: { on: () => {}, off: () => {}, emit: () => {} },
  }
}

afterEach(() => jest.restoreAllMocks())

it('renders cached sizes and escaped npm description in the initial HTML without a browser', async () => {
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'hit', value: result })
  const request = context()
  const { props } = await getServerSideProps(request)

  const html = renderToStaticMarkup(
    React.createElement(
      RouterContext.Provider,
      { value: router() },
      React.createElement(ResultPage, props),
    ),
  )

  expect(request.res.statusCode).toBe(200)
  expect(html).toContain('Bundle Size')
  expect(html).toContain('Minified + Gzipped')
  expect(html).toContain('Useful &lt;img')
  expect(html).not.toContain('<img src="x"')
  expect(html).not.toContain('result-pending')
})

it('keeps the loader available on a miss so the normal API can admit a bounded first build', async () => {
  jest
    .spyOn(CacheServiceClient.prototype, 'getPackageSize')
    .mockResolvedValue({ status: 'miss' })
  const request = context()
  expect((await getServerSideProps(request)).props.initialResult).toBeNull()
  expect(request.res.statusCode).toBe(200)
  const visitor = context('Mozilla/5.0')
  expect((await getServerSideProps(visitor)).props.initialResult).toBeNull()
  expect(visitor.res.statusCode).toBe(200)
})
