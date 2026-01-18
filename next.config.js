const path = require('path')

module.exports = {
  pageExtensions: ['page.js', 'page.tsx'],
  sassOptions: {
    includePaths: [path.join(__dirname, 'stylesheets')],
  },
  // Temporarily ignore TypeScript errors during build
  // due to React 18 type incompatibilities with react-autocomplete and react-sidebar
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    RELEASE_DATE: new Date().toDateString(),
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgoConfig: {
              plugins: [
                {
                  name: 'removeViewBox',
                  active: false,
                },
              ],
            },
          },
        },
      ],
    })

    return config
  },
}
