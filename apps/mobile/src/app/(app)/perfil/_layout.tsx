import { Stack } from 'expo-router'

// Stack do Perfil: index → editar → seguranca. Header oculto (telas próprias).
export default function PerfilLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
