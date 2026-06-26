// Visualizador de imagem em tela cheia DENTRO do app (sem mandar pro navegador).
// Pinch dá zoom, arrasto move a imagem, ✕ ou o botão voltar fecham. Usado pelos
// anexos do helpdesk. Construído com a API NOVA do gesture-handler + Reanimated 4
// (compatível com a Nova Arquitetura do SDK 54).
import { useEffect } from 'react'
import { Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

export function ImageViewerModal({
  uri,
  onClose,
}: {
  /** URL da imagem a exibir; `null` mantém o modal fechado. */
  uri: string | null
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  // Cada imagem aberta começa em 1x, centralizada.
  useEffect(() => {
    if (uri) {
      scale.value = 1
      savedScale.value = 1
      tx.value = 0
      ty.value = 0
      savedTx.value = 0
      savedTy.value = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri])

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale)
    })
    .onEnd(() => {
      savedScale.value = scale.value
      // Voltou a 1x → recentraliza.
      if (scale.value <= 1) {
        tx.value = withTiming(0)
        ty.value = withTiming(0)
        savedTx.value = 0
        savedTy.value = 0
      }
    })

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX
      ty.value = savedTy.value + e.translationY
    })
    .onEnd(() => {
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const composed = Gesture.Simultaneous(pinch, pan)

  const estilo = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }))

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* gesture-handler dentro de Modal precisa do próprio root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar imagem"
            onPress={onClose}
            style={{ position: 'absolute', top: 44, right: 12, zIndex: 10, padding: 10 }}
          >
            <Ionicons name="close" size={30} color="#ffffff" />
          </Pressable>

          <GestureDetector gesture={composed}>
            <Reanimated.View
              style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, estilo]}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={{ width, height: height * 0.85 }}
                  contentFit="contain"
                  transition={150}
                />
              ) : null}
            </Reanimated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
