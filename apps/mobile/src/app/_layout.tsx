import '../global.css'

import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation"
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useColorScheme } from 'nativewind'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { Providers } from '@/lib/providers'
import { loadTenantId } from '@/lib/tenant'
import { applyThemePref, getThemePref } from '@/lib/theme-preference'

export default function RootLayout() {
  // Scheme resolvido pelo NativeWind (respeita a preferência manual de tema).
  const { colorScheme } = useColorScheme()

  // Carrega o tenant ativo + aplica a preferência de tema salva (no boot).
  useEffect(() => {
    loadTenantId()
    void getThemePref().then(applyThemePref)
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
