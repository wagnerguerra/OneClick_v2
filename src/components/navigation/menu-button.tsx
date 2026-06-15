// Botão de menu (hambúrguer) — abre o Drawer da área autenticada.
//
// Fica no header das telas (Agenda, Tarefas) à esquerda do título. O ícone
// Ionicons não aceita className do NativeWind para cor, então resolvemos o hex
// pelo tema atual (claro/escuro).

import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from 'expo-router'
import { Pressable, useColorScheme } from 'react-native'

// O navigation do Drawer expõe openDrawer() (DrawerActionHelpers). Tipamos só o
// que usamos para não depender de @react-navigation/native (não é dep direta).
type ComOpenDrawer = { openDrawer: () => void }

/** Abre o Drawer da área autenticada ao tocar. */
export function MenuButton() {
  const navigation = useNavigation() as unknown as ComOpenDrawer
  const isDark = useColorScheme() === 'dark'

  // Cor do ícone via hex por tema (Ionicons não herda tokens do NativeWind).
  const iconColor = isDark ? '#e8edf7' : '#1e293b'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir menu"
      onPress={() => navigation.openDrawer()}
      className="h-10 w-10 items-center justify-center rounded-xl active:bg-muted"
    >
      <Ionicons name="menu" size={24} color={iconColor} />
    </Pressable>
  )
}
