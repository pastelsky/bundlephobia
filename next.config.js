const withSass = require('@zeit/next-sass')
const withCss = require('@zeit/next-css')
const withSourceMaps = require('@zeit/next-source-maps')

module.exports = {
  ...withSourceMaps(
    withSass({
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
