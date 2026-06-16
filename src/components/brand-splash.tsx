// Splash de marca (JS) exibido por cima do app no boot: fundo navy estilizado
// com um glow suave atrás do wordmark OneClick centralizado. Some com fade-out
// depois de uma janela curta — entra logo após o splash nativo (mesmo fundo),
// dando uma abertura contínua e com a nossa identidade.

import { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet } from 'react-native'

const BG = '#0f1729' // mesmo backgroundColor do splash nativo (transição sem flash)
const LOGO = require('../../assets/images/logo-light.png') // wordmark branco (187x32)
const GLOW = require('../../assets/images/logo-glow.png') // glow azul radial

export function BrandSplash({ onHidden }: { onHidden: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Mostra brevemente e some — tempo suficiente pra perceber a marca sem travar.
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }).start(() => onHidden())
    }, 850)
    return () => clearTimeout(t)
  }, [opacity, onHidden])

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: BG, alignItems: 'center', justifyContent: 'center', opacity },
      ]}
    >
      {/* Glow atrás do wordmark. */}
      <Image
        source={GLOW}
        style={{ position: 'absolute', width: 360, height: 360, opacity: 0.55 }}
        resizeMode="contain"
      />
      {/* Wordmark OneClick centralizado (proporção 187x32). */}
      <Image source={LOGO} style={{ width: 220, height: (220 * 32) / 187 }} resizeMode="contain" />
    </Animated.View>
  )
}
