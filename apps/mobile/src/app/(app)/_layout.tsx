import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, useColorScheme, View } from 'react-native'

import { useSession } from '@/lib/auth-client'

// Área autenticada — tabs (Agenda, Tarefas). Guard: sem sessão volta pro login.
export default function AppLayout() {
  const { data: session, isPending } = useSession()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // NativeWind className não se aplica em options do navigator → cores via hex por tema.
  const activeColor = isDark ? '#38bdf8' : '#0ea5e9'
  const inactiveColor = '#94a3b8'
  const tabBarBg = isDark ? '#18181b' : '#ffffff'
  const tabBarBorder = isDark ? '#27272a' : '#e2e8f0'

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    )
  }

  if (!session) return <Redirect href="/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: tabBarBorder,
        },
      }}
    >
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tarefas"
        options={{
          title: 'Tarefas',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'checkbox' : 'checkbox-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: 'Conta',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
