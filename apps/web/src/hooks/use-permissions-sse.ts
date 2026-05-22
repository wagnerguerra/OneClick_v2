'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { getApiUrl } from '@/lib/api-url'
import { refreshUserPermissions } from '@/hooks/use-user-permissions'

/**
 * Conecta ao SSE `/api/permissions/events` e dispara o evento global
 * `user-permissions-refresh` quando o backend notifica que as permissões do
 * usuário logado mudaram (admin alterou via /usuarios).
 *
 * Filtra por userId — só reage quando o evento é do próprio usuário.
 * Tem retry exponencial igual ao SSE do dashboard layout.
 */
export function usePermissionsSse() {
  const { data: session } = useSession()
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        const apiUrl = getApiUrl()
        es = new EventSource(`${apiUrl}/api/permissions/events`)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as { type: string; userId: string }
            if (ev.type !== 'updated') return
            if (ev.userId !== userId) return
            refreshUserPermissions()
          } catch { /* payload inválido — ignora */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [userId])
}
