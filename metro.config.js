// Metro config — Expo SDK 52 + NativeWind v4 (projeto STANDALONE).
//
// Sem os hacks de monorepo (serverRoot, entry relativo, dedup de React): aqui só
// existe React 18.3.1, o entry resolve normal e o projeto é a raiz do Metro.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// SDK 52 = Metro 0.81: o campo "exports" do package.json vem DESLIGADO (default só
// no SDK 53). Pacotes como better-auth/react, better-auth/client/plugins e
// @better-auth/expo/client só expõem os subpaths via "exports".
config.resolver.unstable_enablePackageExports = true

// @saas/types é vendorizado em vendor/saas-types (sincronizado do D:\oc via
// `node scripts/sync-saas-types.mjs`). Alias p/ o Metro resolver o import bare.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@saas/types': path.resolve(__dirname, 'vendor/saas-types'),
}

module.exports = withNativeWind(config, { input: './src/global.css' })
