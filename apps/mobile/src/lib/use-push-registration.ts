// Hook de registro de push: pede permissão, obtém token e trata cliques nas notificações.
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

import { pedirPermissaoEObterToken, registrarCanalAndroid } from '@/lib/push'
import { trpc } from '@/lib/trpc'

export function usePushRegistration(): void {
  const router = useRouter()
  // Ref pro router para o efeito não recriar (e não disparar a regra de hooks).
  const routerRef = useRef(router)
  routerRef.current = router

  // Mutation de registro do token no backend (Redis via tRPC). Ref pra usar
  // dentro do efeito sem recriá-lo.
  const registrar = trpc.push.register.useMutation()
  const registrarRef = useRef(registrar)
  registrarRef.current = registrar

  useEffect(() => {
    let ativo = true

    // Registro inicial: canal Android → permissão/token → backend (Redis).
    void (async () => {
      await registrarCanalAndroid()
      const token = await pedirPermissaoEObterToken()
      if (ativo && token) {
        await registrarRef.current.mutateAsync({ token, platform: Platform.OS }).catch(() => {})
      }
    })()

    // App em primeiro plano: notificação recebida (por ora só loga).
    const recebidaSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[push] notificação recebida em foreground:', notification.request.content.title)
    })

    // Usuário tocou na notificação → navega conforme o payload.
    const respostaSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { tipo?: string; eventoId?: string | number }
        | undefined

      if (data?.tipo === 'agenda') {
        if (data.eventoId != null) {
          routerRef.current.push(`/agenda/${data.eventoId}`)
        } else {
          routerRef.current.push('/agenda')
        }
      }
    })

    return () => {
      ativo = false
      recebidaSub.remove()
      respostaSub.remove()
    }
  }, [])
}
