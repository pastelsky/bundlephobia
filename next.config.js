const path = require('path')
const glob = require('glob')
const webpack = require('webpack')

require('dotenv').config()

module.exports = {
  webpack: (config, { dev }) => {
    config.module.rules.push(
      {
        test: /\.(css|scss)/,
        loader: 'emit-file-loader',
        options: {
          name: 'dist/[path][name].[ext]',
        },
      }, {
        test: /\.css$/,
        use: ['babel-loader', 'raw-loader', 'postcss-loader'],
      }, {
        test: /\.scss$/,
        use: ['babel-loader', 'raw-loader', 'postcss-loader',
          {
            loader: 'sass-loader',
            options: {
              includePaths: [
                'pages/**',
                'node_modules',
              ]
                .map((d) => path.join(__dirname, d))
                .map((g) => glob.sync(g))
                .reduce((a, c) => a.concat(c), []),
            },
          },
        ],
      },
    )

    config.plugins = config.plugins.filter(p =>
      p.constructor.name !== 'UglifyJsPlugin'
    )

    if(!dev) {
      const Uglify = require('uglifyjs-webpack-plugin')
      config.plugins.push(
        new Uglify({
          parallel: true,
          sourceMap: true
        })
      )
    }
    
    return config
  },
}