import { Stack } from 'expo-router'

// Stack de Configurações. Sem o _layout a pasta registra como "configuracoes/index"
// e o Drawer (navigation.navigate('configuracoes')) não acha a rota.
export default function ConfiguracoesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
