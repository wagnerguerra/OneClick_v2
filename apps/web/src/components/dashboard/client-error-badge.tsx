'use client'

/**
 * Badge no header com contagem de erros JS abertos do navegador.
 * Só aparece em DEV E pra usuários master/empresaMaster (mesmo gate do
 * /admin/erros-cliente — não adianta mostrar indicador pra quem não acessa).
 * Recebe atualizações em tempo real via SSE.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bug } from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

export function ClientErrorBadge() {
  const [count, setCount] = useState<number>(0)
  const { profile } = useCurrentUserProfile()
  const isDev = process.env.NODE_ENV !== 'production'
  const canAccess = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const enabled = isDev && canAccess

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const refresh = async () => {
      try {
        const stats = await (trpc.clientError as any).getStats.query()
        if (!cancelled) setCount(stats.abertos ?? 0)
      } catch { /* silent */ }
    }
    void refresh()
    // SSE pra recarregar quando há mudanças
    const es = new EventSource(`${getApiUrl()}/api/client-errors/events`)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    es.onmessage = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(refresh, 400)
    }
    es.onerror = () => { /* reconnect automático */ }
    return () => {
      cancelled = true
      es.close()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <Link
      href="/admin/erros-cliente"
      title={count > 0 ? `${count} erro(s) JS aberto(s) — clique para inspecionar` : 'Nenhum erro JS aberto'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
        count > 0
          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Bug className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold tabular-nums border-2 border-card">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
