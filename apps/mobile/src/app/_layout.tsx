import '../global.css'

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { Providers } from '@/lib/providers'
import { loadTenantId } from '@/lib/tenant'

export default function RootLayout() {
  const colorScheme = useColorScheme()

  // Carrega o tenant ativo do SecureStore pro cache em memória (headers do tRPC).
  useEffect(() => {
    loadTenantId()
  }, [])

  return (
    <Providers>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </Providers>
  )
}
