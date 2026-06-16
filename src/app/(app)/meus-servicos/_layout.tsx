import { Stack } from 'expo-router'

// Stack do módulo Meus Serviços: index (execuções) → [id] (passos da execução).
export default function MeusServicosLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
