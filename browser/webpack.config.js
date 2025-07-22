const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: './src/client.js',
    output: {
      path: path.resolve(__dirname),
      filename: isProduction ? 'web-ide-bridge.min.js' : 'web-ide-bridge.js',
      library: 'WebIdeBridge',
      libraryTarget: 'umd',
      libraryExport: 'default',
      globalObject: 'this',
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
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction,
              drop_debugger: isProduction
            },
            format: {
              comments: false
            }
          },
          extractComments: false
        })
      ]
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
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
