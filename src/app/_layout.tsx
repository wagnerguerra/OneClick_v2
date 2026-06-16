import '../global.css'

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { useColorScheme } from 'nativewind'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { Providers } from '@/lib/providers'
import { loadTenantId } from '@/lib/tenant'
import { applyThemePref, getThemePref } from '@/lib/theme-preference'
import { BrandSplash } from '@/components/brand-splash'

// Segura o splash NATIVO até o JS montar — aí o splash de marca (JS) assume com
// o mesmo fundo, sem flash. (Chamado no escopo do módulo, antes do render.)
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  // Scheme resolvido pelo NativeWind (respeita a preferência manual de tema).
  const { colorScheme } = useColorScheme()
  // Controla o splash de marca (JS) por cima do app durante o boot.
  const [splashVisivel, setSplashVisivel] = useState(true)

  // Carrega o tenant ativo + aplica a preferência de tema salva (no boot).
  useEffect(() => {
    loadTenantId()
    void getThemePref().then(applyThemePref)
    // JS já montou → esconde o splash nativo (o BrandSplash, com o mesmo fundo,
    // já está renderizado por cima, então a troca é imperceptível).
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    // GestureHandlerRootView é obrigatório p/ os gestos (ex.: swipe nos cards de
    // evento do dashboard) funcionarem — o expo-router não o injeta sozinho.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <SafeAreaProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="auto" />
          </ThemeProvider>
        </SafeAreaProvider>
      </Providers>

      {/* Splash de marca (wordmark + glow) por cima de tudo até o fade-out. */}
      {splashVisivel ? <BrandSplash onHidden={() => setSplashVisivel(false)} /> : null}
    </GestureHandlerRootView>
  )
}
