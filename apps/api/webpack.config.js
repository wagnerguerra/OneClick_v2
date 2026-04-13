const path = require('path')
const nodeExternals = require('webpack-node-externals')

module.exports = function (options) {
  return {
    ...options,
    externals: [
      nodeExternals({
        allowlist: [/^@saas\//],
        modulesDir: path.resolve(__dirname, '../../node_modules'),
      }),
      nodeExternals({
        allowlist: [/^@saas\//],
        modulesDir: path.resolve(__dirname, 'node_modules'),
      }),
    ],
    resolve: {
      ...options.resolve,
      alias: {
        '@saas/db': path.resolve(__dirname, '../../packages/db/src'),
        '@saas/types': path.resolve(__dirname, '../../packages/types/src'),
      },
    },
  }
}
