import { Stack } from 'expo-router'

// Stack da Agenda: index (lista) → [id] (detalhe). Header oculto (telas próprias).
export default function AgendaLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
