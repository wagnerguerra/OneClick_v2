// Moldura padrão das telas autenticadas — wrapper com:
//   1. SafeAreaView de fundo (tokens semânticos);
//   2. Transição suave de ENTRADA ao montar a tela (fade + leve slide), via
//      react-native-reanimated (API declarativa `entering`, sem worklets manuais);
//   3. Bottom tab bar fixa no rodapé (navegação principal).
//
// Cada tela autenticada envolve seu conteúdo com <AppScreen>. O conteúdo continua
// dono do próprio ScrollView/headers — aqui só cuidamos do chrome compartilhado.
//
// SDK 56: reanimated 4 é injetado por babel-preset-expo (ver babel.config.js).
// Usamos `FadeIn`/transições declarativas — não importamos @react-navigation/*.

import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'

export interface AppScreenProps {
  children: ReactNode
}

/**
 * Envolve uma tela autenticada: fundo + animação de entrada + bottom tab bar.
 * O `edges` não inclui 'bottom' — a barra inferior cuida do safe-area de baixo.
 */
export function AppScreen({ children }: AppScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Conteúdo da tela com fade-in sutil a cada montagem (troca de aba). */}
      <Animated.View
        className="flex-1"
        entering={FadeIn.duration(220)}
        // Garante que a animação re-execute mesmo se o RN reaproveitar a view.
      >
        {children}
      </Animated.View>

      {/* Barra inferior fixa (não rola com o conteúdo). */}
      <View>
        <BottomTabBar />
      </View>
    </SafeAreaView>
  )
}
