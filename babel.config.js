// Babel — Expo SDK 52 + NativeWind v4.
// jsxImportSource: 'nativewind' habilita className nos componentes RN; o preset
// babel-preset-expo já injeta o plugin do react-native-reanimated.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
