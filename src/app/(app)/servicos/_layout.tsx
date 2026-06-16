import { Stack } from 'expo-router'

// Stack do módulo Serviços: index (catálogo) → novo (cadastro/edição). Header oculto.
export default function ServicosLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
