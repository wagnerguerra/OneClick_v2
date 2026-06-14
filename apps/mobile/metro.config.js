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

module.exports = withNativeWind(config, { input: './src/global.css' })
