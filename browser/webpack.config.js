const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const { VERSION } = require('./version.js');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: './src/client.js',
    plugins: [
      new (require('webpack')).DefinePlugin({
        'process.env.VERSION': JSON.stringify(VERSION)
      }),
      new (require('webpack')).BannerPlugin({
        banner: `/**
 * Web-IDE-Bridge v${VERSION}
 * Browser library for seamless IDE integration
 * 
 * ${isProduction ? 'This is the production build (minified).' : 'This is the development build with full debugging support.'}
 */`,
        raw: true,
        entryOnly: true
      })
    ],
    output: {
      path: path.resolve(__dirname),
      filename: isProduction ? 'web-ide-bridge.min.js' : 'web-ide-bridge-built.js',
      library: 'WebIdeBridge',
      libraryTarget: 'var',
      libraryExport: 'default',
      clean: false // Don't clean the entire directory
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  targets: {
                    browsers: ['> 1%', 'last 2 versions', 'not dead']
                  },
                  modules: false
                }]
              ]
            }
          }
        }
      ]
    },
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true,
              drop_debugger: true
            },
            format: {
              comments: /^\/\* Web-IDE-Bridge/
            }
          },
          extractComments: false
        })
      ] : []
    },
    devtool: isProduction ? 'source-map' : 'source-map',
    devServer: {
      static: {
        directory: path.join(__dirname),
      },
      compress: true,
      port: 8080,
      open: true,
      openPage: 'demo.html',
      hot: true,
      liveReload: true
    },
    resolve: {
      extensions: ['.js'],
      modules: ['node_modules', 'src']
    },
    target: 'web'
  };
};
