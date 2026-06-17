import { Stack } from 'expo-router'

// Stack do módulo Clientes: index (lista) → [id] (detalhe c/ abas) → novo (form).
export default function ClientesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
