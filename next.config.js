const withSass = require('@zeit/next-sass')
const withCss = require('@zeit/next-css')

module.exports = {
  ...withSass({
    sassLoaderOptions: {
      sassOptions: {
        includePaths: ['pages/**', 'node_modules'],
      },
    },
  }),
  env: {
    RELEASE_DATE: new Date().toDateString(),
  },
}
