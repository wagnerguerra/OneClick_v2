// Babel — Expo SDK 56 + NativeWind v5.
// O v5 NÃO usa `jsxImportSource` nem o preset `nativewind/babel`: a interop de
// `className` passou a ser feita por reescrita de imports no Metro (withNativeWind).
// O babel-preset-expo já injeta o plugin do react-native-worklets/reanimated e
// respeita o experimento `reactCompiler` do app.json.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
