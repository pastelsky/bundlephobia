const withSass = require('@zeit/next-sass')
const withCss = require('@zeit/next-css')
const withSourceMaps = require('@zeit/next-source-maps')()

module.exports = {
  webpack5: false,
  pageExtensions: ['page.js'],
  ...withSass(
    withSourceMaps({
      sassLoaderOptions: {
        sassOptions: {
          includePaths: ['pages/**', 'node_modules'],
        },
      },
    })
  ),
  env: {
    RELEASE_DATE: new Date().toDateString(),
  },
}
