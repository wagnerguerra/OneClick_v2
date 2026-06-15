import { Stack } from 'expo-router'

// Stack de Tarefas. Sem o _layout, a pasta registra como "tarefas/index" e o
// Drawer (navigation.navigate('tarefas')) não acha a rota → item do menu não
// navega. Com o Stack, registra como "tarefas" (igual agenda/helpdesk/perfil).
export default function TarefasLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
