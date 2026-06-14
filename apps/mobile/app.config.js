// Config dinâmica do Expo — estende o app.json.
//
// Monorepo pnpm: o Metro força o serverRoot p/ o workspace root (D:\o1), então o
// entry só resolve com o gradle `root` = workspace (projectRoot = workspace). Mas
// nesse caso o expo-router procuraria as rotas em <workspace>/src/app. O
// babel-preset-expo (getExpoRouterAbsoluteAppRoot) usa `extra.router.root`
// como-está quando é ABSOLUTO, ignorando o projectRoot — então apontamos p/ o
// src/app real do app. path.resolve(__dirname, ...) mantém portável (sem hardcode).
const path = require('path')

module.exports = ({ config }) => {
  config.extra = config.extra || {}
  config.extra.router = {
    ...(config.extra.router || {}),
    root: path.resolve(__dirname, 'src/app'),
  }
  // Signing de release permanente (injeta no build.gradle a cada prebuild).
  config.plugins = [...(config.plugins || []), './plugins/withReleaseSigning']
  return config
}
