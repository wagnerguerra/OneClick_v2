// Tela de Configurações (rota /configuracoes) — preferências do app + manutenção.
//
// Reúne as PREFERÊNCIAS (antes no Perfil): notificações push, tema e idioma; e a
// seção APLICATIVO com a versão atual + o botão "Verificar atualizações".

import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import Constants from 'expo-constants'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { ListItem } from '@/components/ui/list-item'
import { SectionHeader } from '@/components/ui/section-header'
import { Spinner } from '@/components/ui/spinner'
import { SwitchRow } from '@/components/ui/switch-row'
import { Text } from '@/components/ui/text'
import { usePushToggle } from '@/lib/use-push-toggle'
import { useThemePref } from '@/lib/use-theme'
import { THEME_LABELS, type ThemePref } from '@/lib/theme-preference'
import { checkForUpdate } from '@/lib/update-check'

export default function ConfiguracoesScreen() {
  const { enabled: pushEnabled, loading: pushLoading, toggle: togglePush } = usePushToggle()
  const { pref: temaPref, setPref: setTema } = useThemePref()
  const [checando, setChecando] = useState(false)

  const versao = Constants.expoConfig?.version ?? '—'

  // Seletor de tema (diálogo nativo).
  function escolherTema() {
    const opcao = (p: ThemePref) => ({ text: THEME_LABELS[p], onPress: () => setTema(p) })
    Alert.alert('Tema', 'Como o app deve exibir as cores?', [
      opcao('system'),
      opcao('light'),
      opcao('dark'),
      { text: 'Cancelar', style: 'cancel' as const },
    ])
  }

  // Checagem manual de atualização (avisa também quando já está atualizado).
  async function verificarAtualizacoes() {
    if (checando) return
    setChecando(true)
    try {
      await checkForUpdate({ manual: true })
    } finally {
      setChecando(false)
    }
  }

  return (
    <AppScreen>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Cabeçalho — menu (abre o Drawer) + título. */}
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Ajustes</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Configurações</Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Seção: Preferências. */}
          <View className="gap-2">
            <SectionHeader title="Preferências" />
            <SwitchRow
              label="Notificações push"
              description={pushLoading ? 'Atualizando…' : 'Receber alertas no dispositivo'}
              value={pushEnabled}
              onValueChange={togglePush}
            />
            <ListItem
              icon="contrast-outline"
              title="Tema"
              trailing={THEME_LABELS[temaPref]}
              onPress={escolherTema}
            />
            {/* Idioma ainda sem troca → linha de leitura (sem onPress). */}
            <ListItem icon="language-outline" title="Idioma" trailing="Português" />
          </View>

          {/* Seção: Aplicativo. */}
          <View className="gap-2">
            <SectionHeader title="Aplicativo" />
            <ListItem
              icon="cloud-download-outline"
              title="Verificar atualizações"
              subtitle={`Versão atual: ${versao}`}
              trailing={checando ? <Spinner size="small" /> : undefined}
              onPress={verificarAtualizacoes}
            />
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  )
}
