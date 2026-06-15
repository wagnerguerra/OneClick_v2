// Config dinâmica do Expo — estende o app.json.
// Projeto standalone: o expo-router detecta o src/app normalmente (não precisa do
// hack de router.root absoluto que o monorepo exigia). Só liga o plugin de signing.
module.exports = ({ config }) => {
  // Signing de release permanente (injeta no build.gradle a cada prebuild).
  config.plugins = [...(config.plugins || []), './plugins/withReleaseSigning']
  return config
}
