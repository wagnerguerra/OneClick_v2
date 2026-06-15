import { Stack } from 'expo-router'

// Stack do Dashboard. Mesmo motivo do tarefas/_layout: sem ele a pasta registra
// como "dashboard/index" e o Drawer (navigation.navigate('dashboard')) não acha a
// rota — só não aparecia porque é a rota inicial. Registra como "dashboard".
export default function DashboardLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
