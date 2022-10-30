const path = require('path')

module.exports = {
  pageExtensions: ['page.js'],
  sassOptions: {
    includePaths: [path.join(__dirname, 'stylesheets')],
  },
  env: {
    RELEASE_DATE: new Date().toDateString(),
  },
}
