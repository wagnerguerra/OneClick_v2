import type { ComponentProps } from 'react'
import { Redirect } from 'expo-router'
import { Drawer } from 'expo-router/drawer'
import { ActivityIndicator, useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { AppDrawer } from '@/components/navigation/app-drawer'
import { useSession } from '@/lib/auth-client'
import { usePushRegistration } from '@/lib/use-push-registration'

// Área autenticada — navegação por menu lateral (Drawer) preparado pra blocos/
// módulos. Guard: sem sessão volta pro login. O conteúdo do menu é o AppDrawer.
export default function AppLayout() {
  const { data: session, isPending } = useSession()
  // Registro de push — antes dos early returns para manter a ordem dos hooks estável.
  usePushRegistration()
  const isDark = useColorScheme() === 'dark'

  // NativeWind className não se aplica em screenOptions → cor (card) via hex por tema.
  const drawerBg = isDark ? '#18181b' : '#ffffff'

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    )
  }

  if (!session) return <Redirect href="/login" />

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        // O props do expo-router e o do @react-navigation/drawer são
        // estruturalmente iguais, mas nominalmente distintos (resoluções de
        // tipo diferentes). Repassamos com cast — em runtime é o mesmo objeto.
        drawerContent={(props) => (
          <AppDrawer {...(props as unknown as ComponentProps<typeof AppDrawer>)} />
        )}
        screenOptions={{
          headerShown: false,
          drawerStyle: { backgroundColor: drawerBg },
          swipeEdgeWidth: 80,
        }}
      >
        <Drawer.Screen name="agenda" options={{ title: 'Agenda' }} />
        <Drawer.Screen name="tarefas" options={{ title: 'Tarefas' }} />
        {/* Rota perfil declarada aqui; a tela será criada por outro agente. */}
        <Drawer.Screen name="perfil" options={{ title: 'Perfil' }} />
      </Drawer>
    </GestureHandlerRootView>
  )
}
