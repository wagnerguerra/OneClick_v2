'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { useSession } from '@/lib/auth-client'
import { getApiUrl } from '@/lib/api-url'

interface LembretePayload {
  type: 'lembrete'
  eventoId: string
  titulo: string
  data: string
  horaInicio: string | null
  diaInteiro: boolean
  local: string | null
  minutosAntes: number
}

function formatarAntecedencia(min: number): string {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} dia${Math.round(min / 1440) > 1 ? 's' : ''}`
}

function formatarQuandoEvento(payload: LembretePayload): string {
  const [y, m, d] = payload.data.split('-')
  const dataBr = `${d}/${m}/${y}`
  if (payload.diaInteiro || !payload.horaInicio) return `${dataBr} · dia inteiro`
  return `${dataBr} · ${payload.horaInicio}`
}

/**
 * Conecta ao SSE de lembretes da agenda. Ao receber, dispara:
 *   - Notification do navegador (se permitido)
 *   - Toast no canto superior direito (Swal top-end)
 *
 * Pede permissão de Notification na primeira montagem se ainda não foi pedida.
 * Click no toast/notif navega pra /agenda?verEvento=<id>.
 */
export function useAgendaLembreteSse() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const router = useRouter()

  useEffect(() => {
    if (!userId) return
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>
    let closed = false

    const showLembrete = (payload: LembretePayload) => {
      const antecedencia = formatarAntecedencia(payload.minutosAntes)
      const quando = formatarQuandoEvento(payload)
      const localStr = payload.local ? ` · ${payload.local}` : ''

      // Toast in-app
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: `⏰ Em ${antecedencia}: ${payload.titulo}`,
        text: `${quando}${localStr}`,
        showConfirmButton: false,
        timer: 8000,
        timerProgressBar: true,
        showCloseButton: true,
        didOpen: (toast) => {
          toast.style.cursor = 'pointer'
          toast.addEventListener('click', () => {
            router.push(`/agenda?verEvento=${payload.eventoId}`)
            Swal.close()
          })
        },
      })

      // Notificação do navegador (se permitido)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(`⏰ ${payload.titulo}`, {
            body: `Em ${antecedencia} — ${quando}${localStr}`,
            icon: '/logo.png',
            tag: `agenda-lembrete-${payload.eventoId}-${payload.minutosAntes}`,
          })
          n.onclick = () => {
            window.focus()
            router.push(`/agenda?verEvento=${payload.eventoId}`)
            n.close()
          }
        } catch { /* browser pode bloquear — ignora */ }
      }
    }

    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/agenda/lembretes/events`, { withCredentials: true } as never)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as LembretePayload | { type: 'ping' }
            if (ev.type !== 'lembrete') return
            showLembrete(ev as LembretePayload)
          } catch { /* payload inválido — ignora */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retry = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retry = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retry) }
  }, [userId, router])
}
