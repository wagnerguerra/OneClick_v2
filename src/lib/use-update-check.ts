import { useEffect, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import Constants from 'expo-constants'

import { getApiUrl } from './api-url'

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

/**
 * Verifica, ao abrir o app, se há uma versão mais nova publicada no dashboard
 * (/api/mobile-app → latest) e, se houver, pergunta se o usuário quer atualizar.
 * Como a distribuição é por APK (sideload, fora da Play Store), "atualizar" abre
 * a URL do APK pra baixar/instalar. Roda uma vez por sessão; falha em silêncio.
 *
 * Só faz sentido no Android (no iOS a distribuição é via TestFlight/App Store).
 */
export function useUpdateCheck(): void {
  const jaChecou = useRef(false)

  useEffect(() => {
    if (jaChecou.current || Platform.OS === 'ios') return
    jaChecou.current = true

    void (async () => {
      try {
        const localVersion = Constants.expoConfig?.version ?? '0.0.0'
        const res = await fetch(`${getApiUrl()}/api/mobile-app`, { cache: 'no-store' as RequestCache })
        if (!res.ok) return
        const data = (await res.json()) as {
          latest?: { version?: string | null; url?: string | null } | null
        }
        const latest = data?.latest
        if (!latest?.version || !latest.url) return
        if (cmpSemver(latest.version, localVersion) <= 0) return

        const apkUrl = latest.url.startsWith('http') ? latest.url : `${getApiUrl()}${latest.url}`
        Alert.alert(
          'Atualização disponível',
          `Uma nova versão (v${latest.version}) do OneClick ERP está disponível. Deseja atualizar agora?`,
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Atualizar', onPress: () => { void Linking.openURL(apkUrl) } },
          ],
        )
      } catch {
        /* silencioso — checagem de atualização é best-effort */
      }
    })()
  }, [])
}
