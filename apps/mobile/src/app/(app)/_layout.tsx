import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useSession } from '@/lib/auth-client'

// Área autenticada — tabs (Agenda, Tarefas). Guard: sem sessão volta pro login.
export default function AppLayout() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    )
  }

  if (!session) return <Redirect href="/login" />

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
      <Tabs.Screen name="tarefas" options={{ title: 'Tarefas' }} />
    </Tabs>
  )
}
