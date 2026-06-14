// Metro config — Expo SDK 52 + NativeWind v4 + monorepo pnpm.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// SDK 52 = Metro 0.81, onde o campo "exports" do package.json vem DESLIGADO
// (virou default no SDK 53). Pacotes como better-auth/react, better-auth/client/plugins
// e @better-auth/expo/client só expõem os subpaths via "exports" → sem isso o
// Metro procura o arquivo literal e falha ("could not be found").
config.resolver.unstable_enablePackageExports = true

// serverRoot: o getDefaultConfig do Expo seta unstable_serverRoot = workspace
// (detecta o pnpm-workspace.yaml). Isso desalinha o build de release no Windows:
// o gradle-plugin relativiza o --entry-file contra o projeto (apps/mobile), mas o
// Metro resolve a partir do serverRoot (workspace) → "Unable to resolve ./index.js
// from <workspace>". Forçamos o serverRoot p/ o app; os workspace packages
// (@saas/types) seguem resolvendo via watchFolders, só com path relativo "../../".
config.server = config.server || {}
config.server.unstable_serverRoot = projectRoot

// React DUPLICADO (causa de "Cannot read property 'useContext' of null" no boot):
// monorepo com web (React 19) + mobile (React 18.3.1) e node-linker=hoisted faz o
// react-native (içado p/ a raiz) resolver o react da RAIZ (19), enquanto o app usa
// o 18.3.1 aninhado em apps/mobile/node_modules → DUAS cópias de React → o
// dispatcher de hooks quebra. Forçamos TODO react/react-dom (e subpaths como
// react/jsx-runtime) p/ a cópia 18.3.1 do mobile, independente do hoisting.
const reactNm = path.resolve(projectRoot, 'node_modules')
const baseResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^react($|\/)/.test(moduleName) || /^react-dom($|\/)/.test(moduleName)) {
    try {
      return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [reactNm] }) }
    } catch {}
  }
  return (baseResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './src/global.css' })
