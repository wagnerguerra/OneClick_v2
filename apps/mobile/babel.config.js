// Babel — Expo SDK 56 + NativeWind v4.
// O preset babel-preset-expo já injeta o plugin do react-native-worklets
// (reanimated 4) e respeita o experimento reactCompiler do app.json.
// jsxImportSource: 'nativewind' habilita className nos componentes RN.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
