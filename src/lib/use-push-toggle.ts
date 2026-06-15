// Hook do toggle de notificações push (usado na tela de Perfil).
//
// Diferente do `usePushRegistration` (que roda no boot e só registra), aqui o
// usuário liga/desliga de forma explícita:
//   - LIGAR  → pede permissão, obtém o Expo push token e registra no backend.
//   - DESLIGAR → remove o token do backend (unregister).
// A preferência fica no SecureStore (push-preference) e é respeitada no próximo
// boot pelo `usePushRegistration`.
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { pedirPermissaoEObterToken, registrarCanalAndroid } from '@/lib/push'
import { getPushEnabled, setPushEnabled } from '@/lib/push-preference'
import { trpc } from '@/lib/trpc'

export interface PushToggle {
  /** Estado atual da preferência. */
  enabled: boolean
  /** Há uma operação de registro/baixa em andamento. */
  loading: boolean
  /** Alterna o estado (otimista, com reversão em falha). */
  toggle: (next: boolean) => Promise<void>
}

export function usePushToggle(): PushToggle {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(false)

  const registrar = trpc.push.register.useMutation()
  const desregistrar = trpc.push.unregister.useMutation()

  // Carrega a preferência salva ao montar.
  useEffect(() => {
    let ativo = true
    void getPushEnabled().then((v) => {
      if (ativo) setEnabled(v)
    })
    return () => {
      ativo = false
    }
  }, [])

  async function toggle(next: boolean): Promise<void> {
    if (loading) return
    setLoading(true)
    // A PREFERÊNCIA manda: reflete na UI e persiste imediatamente. O registro do
    // token é best-effort — NÃO reverte o switch se falhar (ex.: emulador sem FCM
    // ou permissão ainda não concedida). O token é tentado de novo no próximo boot.
    setEnabled(next)
    void setPushEnabled(next)
    try {
      if (next) {
        await registrarCanalAndroid()
        const token = await pedirPermissaoEObterToken()
        if (token) await registrar.mutateAsync({ token, platform: Platform.OS }).catch(() => {})
      } else {
        // Remove o token atual do backend (se já tivermos um, sem forçar prompt).
        const token = await pedirPermissaoEObterToken()
        if (token) await desregistrar.mutateAsync({ token }).catch(() => {})
      }
    } catch {
      // Registro é best-effort; a preferência (já salva) permanece.
    } finally {
      setLoading(false)
    }
  }

  return { enabled, loading, toggle }
}
