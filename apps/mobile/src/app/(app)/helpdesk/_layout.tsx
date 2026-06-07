import { Stack } from 'expo-router'

// Stack do Helpdesk: index (lista) → novo (criar) → [id] (detalhe).
// Header oculto — cada tela renderiza o próprio cabeçalho.
export default function HelpdeskLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
