// Metro config — Expo SDK 56 + NativeWind v5 + monorepo pnpm.
//
// withNativeWind SEM `input`: no v5 o CSS é descoberto pelo import (src/global.css)
// e processado via @tailwindcss/postcss. Mantemos o setup de monorepo:
//   - watchFolders: raiz do workspace (observa packages/* e apps/*)
//   - nodeModulesPaths: node_modules local + da raiz
// Não desabilitar hierarchicalLookup (pnpm co-localiza deps em .pnpm).
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

module.exports = withNativeWind(config)
