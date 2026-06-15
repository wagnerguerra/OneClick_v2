// Verificação de atualização do app (distribuição por APK / sideload).
//
// Compara a versão local com a `latest` publicada em /api/mobile-app. Se houver
// uma mais nova, abre um diálogo pra baixar o APK. Usado no boot (silencioso) e
// no botão "Verificar atualizações" das Configurações (manual = avisa também
// quando já está atualizado ou se der erro).
import { Alert, Linking, Platform } from 'react-native'
import Constants from 'expo-constants'

import { getApiUrl } from './api-url'

export type UpdateResult = 'updated' | 'up-to-date' | 'unavailable' | 'error'

// Compara duas versões semver. Retorna >0 se a > b.
function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function checkForUpdate(opts?: { manual?: boolean }): Promise<UpdateResult> {
  const manual = opts?.manual ?? false

  if (Platform.OS === 'ios') {
    if (manual) {
      Alert.alert('Atualizações', 'No iOS a atualização é feita pela App Store / TestFlight.')
    }
    return 'unavailable'
  }

  try {
    const localVersion = Constants.expoConfig?.version ?? '0.0.0'
    const res = await fetch(`${getApiUrl()}/api/mobile-app`, { cache: 'no-store' as RequestCache })
    if (!res.ok) throw new Error('fetch falhou')
    const data = (await res.json()) as {
      latest?: { version?: string | null; url?: string | null } | null
    }
    const latest = data?.latest
    if (!latest?.version || !latest.url) {
      if (manual) Alert.alert('Atualizações', 'Nenhuma versão disponível no momento.')
      return 'unavailable'
    }

    if (cmpSemver(latest.version, localVersion) <= 0) {
      if (manual) {
        Alert.alert('Tudo certo ✓', `Você já está na versão mais recente (v${localVersion}).`)
      }
      return 'up-to-date'
    }

    const apkUrl = latest.url.startsWith('http') ? latest.url : `${getApiUrl()}${latest.url}`
    Alert.alert(
      'Atualização disponível',
      `Uma nova versão (v${latest.version}) do OneClick ERP está disponível. Deseja atualizar agora?`,
      [
        { text: 'Agora não', style: 'cancel' },
        {
          text: 'Atualizar',
          onPress: () => {
            void Linking.openURL(apkUrl)
          },
        },
      ],
    )
    return 'updated'
  } catch {
    if (manual) Alert.alert('Erro', 'Não foi possível verificar atualizações. Tente novamente.')
    return 'error'
  }
}
