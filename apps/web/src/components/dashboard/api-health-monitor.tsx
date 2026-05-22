'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'
import { getApiUrl } from '@/lib/api-url'

const PING_INTERVAL_MS = 15_000        // 15s entre pings normais
const PING_INTERVAL_FAIL_MS = 4_000    // 4s entre pings quando API estiver fora (tenta voltar logo)
const PING_TIMEOUT_MS = 5_000          // request abort em 5s

type Status = 'ok' | 'down' | 'reconnecting'

/**
 * Monitor global de saúde da API.
 * - Faz ping em /api/health periodicamente
 * - Quando detecta queda, mostra banner persistente "Servidor indisponível"
 * - Tenta reconectar automaticamente em intervalo menor
 * - Quando volta, mostra confirmação "Conectado" por alguns segundos
 */
export function ApiHealthMonitor() {
  const [status, setStatus] = useState<Status>('ok')
  const [showRecovered, setShowRecovered] = useState(false)
  const wasDownRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function ping() {
      const ctrl = new AbortController()
      const abortId = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
      try {
        const r = await fetch(`${getApiUrl()}/api/health`, {
          signal: ctrl.signal,
          credentials: 'include',
          cache: 'no-store',
        })
        clearTimeout(abortId)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        if (cancelled) return
        // Se estava down, marca recovery
        if (wasDownRef.current) {
          wasDownRef.current = false
          setShowRecovered(true)
          if (recoveredTimerRef.current) clearTimeout(recoveredTimerRef.current)
          recoveredTimerRef.current = setTimeout(() => setShowRecovered(false), 3500)
        }
        setStatus('ok')
        timerRef.current = setTimeout(ping, PING_INTERVAL_MS)
      } catch {
        clearTimeout(abortId)
        if (cancelled) return
        wasDownRef.current = true
        setStatus(prev => (prev === 'ok' ? 'down' : 'reconnecting'))
        timerRef.current = setTimeout(ping, PING_INTERVAL_FAIL_MS)
      }
    }

    ping()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (recoveredTimerRef.current) clearTimeout(recoveredTimerRef.current)
    }
  }, [])

  if (status !== 'ok') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]',
          'flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-lg',
          'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800',
          'text-rose-800 dark:text-rose-200 text-sm font-medium',
        )}
      >
        {status === 'down' ? (
          <AlertCircle className="h-4 w-4 shrink-0" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        )}
        <div className="space-y-0.5">
          <p className="leading-tight">
            {status === 'down' ? 'Servidor indisponível' : 'Reconectando ao servidor...'}
          </p>
          <p className="text-[11px] text-rose-700/80 dark:text-rose-300/70 leading-tight">
            {status === 'down'
              ? 'Tentando reconectar automaticamente. Algumas funcionalidades podem não responder.'
              : 'Estamos tentando reestabelecer a conexão.'}
          </p>
        </div>
      </div>
    )
  }

  if (showRecovered) {
    return (
      <div
        role="status"
        className={cn(
          'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]',
          'flex items-center gap-2 rounded-lg border px-4 py-2 shadow-lg',
          'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800',
          'text-emerald-800 dark:text-emerald-200 text-sm font-medium',
          'animate-in fade-in slide-in-from-bottom-2 duration-300',
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Conexão restabelecida.
      </div>
    )
  }

  return null
}
