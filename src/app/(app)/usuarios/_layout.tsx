import { Stack } from 'expo-router'

// Stack do módulo Usuários: index (lista) → novo (cadastro/edição). Header oculto.
export default function UsuariosLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
