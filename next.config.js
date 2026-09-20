const path = require('path')

module.exports = {
  reactStrictMode: true,
  pageExtensions: ['page.js', 'page.tsx'],
  experimental: {
    turbopackFileSystemCacheForDev: true,
    useTypeScriptCli: true,
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'stylesheets')],
  },
  env: {
    RELEASE_DATE: new Date().toDateString(),
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: [
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
        as: '*.js',
      },
    },
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
