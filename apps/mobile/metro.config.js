// Metro config — Expo SDK 56 + NativeWind + monorepo pnpm.
//
// O monorepo usa pnpm (node_modules isolado/symlinkado). Pra o Metro achar as
// deps que ficam na raiz do workspace e os pacotes @saas/*, precisamos:
//   - watchFolders: a raiz do workspace (pra observar packages/* e apps/*)
//   - nodeModulesPaths: node_modules local + da raiz
//
// NÃO desabilitar hierarchicalLookup: no pnpm cada pacote tem suas deps
// co-localizadas em .pnpm/<pkg>/node_modules; o lookup hierárquico é o que
// permite o Metro achá-las (ex: @expo/metro-runtime via expo-router).
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

module.exports = withNativeWind(config, { input: './src/global.css' })
