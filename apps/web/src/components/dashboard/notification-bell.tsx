'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, X, Info, AlertTriangle, AlertCircle, CheckCircle2, XCircle, Clock, Loader2, Check, CheckCheck } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import { getApiUrl } from '@/lib/api-url'

interface Notification {
  id: string
  titulo: string
  mensagem: string | null
  tipo: string
  link: string | null
  origem: string | null
  lida: boolean
  lidaEm: string | null
  createdAt: string
  // Backend marca como false para origens gerenciadas pelo sistema (agenda,
  // certificados) — nessas, o X não é renderizado.
  removivel: boolean
}

const TIPO_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string; border: string }> = {
  info:    { icon: Info,         color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-900/20',         border: 'border-sky-200 dark:border-sky-800' },
  success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
  warning: { icon: AlertTriangle,color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-amber-200 dark:border-amber-800' },
  error:   { icon: AlertCircle,  color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-900/20',       border: 'border-rose-200 dark:border-rose-800' },
}

/**
 * Classifica notificação de certificado pelo `&estado=` no link.
 * Retorna 'vencido' (já expirou ou ≤7 dias), 'vencendo' (8-60 dias) ou null (não é cert).
 */
function classificarCert(n: Notification): 'vencido' | 'vencendo' | null {
  if (n.origem !== 'gestao-certificados' || !n.link) return null
  const m = n.link.match(/[?&]estado=([^&]+)/)
  const estado = m?.[1]
  if (estado === 'VENCIDO' || estado === '7D') return 'vencido'
  if (estado === '30D' || estado === '60D') return 'vencendo'
  return null
}

/** Extrai a data de expiração (ISO YYYY-MM-DD) do parâmetro `&exp=` no link. */
function getExpTime(n: Notification): number {
  if (!n.link) return Number.MAX_SAFE_INTEGER
  const m = n.link.match(/[?&]exp=(\d{4}-\d{2}-\d{2})/)
  if (!m) return Number.MAX_SAFE_INTEGER
  const t = new Date(m[1] + 'T00:00:00').getTime()
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

function formatRelativo(d: string): string {
  const dt = new Date(d).getTime()
  const diff = Date.now() - dt
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const dias = Math.floor(h / 24)
  if (dias < 7) return `${dias}d`
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [pendentes, setPendentes] = useState(0)
  const [loading, setLoading] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mantém id da notificação em deleção para mostrar spinner e prevenir double-click
  const [removendo, setRemovendo] = useState<string | null>(null)

  // Função única pra fechar com animação (re-enrola), depois desmonta
  const animatedClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setClosing(true)
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
      setClosing(false)
      closeTimerRef.current = null
    }, 200)  // sincronizado com bellRollUp 200ms
  }, [])

  const toggleOpen = useCallback(() => {
    if (open && !closing) {
      animatedClose()
    } else if (!open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      setClosing(false)
      setOpen(true)
    }
  }, [open, closing, animatedClose])

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

  // Polling do contador a cada 60s pra manter o badge atualizado sem onerar
  const fetchPendentes = useCallback(async () => {
    try {
      const c = await (trpc.notification as any).contarPendentes.query()
      setPendentes(c ?? 0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchPendentes()
    const interval = setInterval(fetchPendentes, 60_000)
    return () => clearInterval(interval)
  }, [fetchPendentes])

  // Carrega lista quando abre
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.notification as any).listarMinhas.query({ limit: 100 })
      setItems(data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) fetchList()
  }, [open, fetchList])

  // SSE — recebe push do backend quando notificações são criadas/removidas/
  // marcadas como lidas pro usuário logado. Mantém o polling de 60s como
  // fallback (caso conexão SSE caia silenciosamente). Filtra por userId.
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
        es = new EventSource(`${apiUrl}/api/notifications/events`)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as { type: string; userId: string }
            if (ev.userId !== userId) return
            // Atualiza contador SEMPRE (badge no botão)
            fetchPendentes()
            // Se o popover está aberto, recarrega lista pra refletir mudanças
            if (open && !closing) fetchList()
          } catch { /* payload inválido */ }
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
  }, [userId, fetchPendentes, fetchList, open, closing])

  // Fecha ao clicar fora (com animação)
  useEffect(() => {
    if (!open || closing) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      animatedClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, closing, animatedClose])

  function handleClickItem(n: Notification) {
    if (n.link) {
      animatedClose()
      router.push(n.link)
    }
  }

  // Remove a notificação da lista — chamada pelo botão X de cada item.
  // Otimismo: tira do estado antes de aguardar a resposta; em caso de erro,
  // recarrega tudo. Atualiza contador também.
  async function handleExcluir(n: Notification, e: React.MouseEvent) {
    e.stopPropagation()
    if (removendo) return
    setRemovendo(n.id)
    const prev = items
    setItems(curr => curr.filter(x => x.id !== n.id))
    setPendentes(p => Math.max(0, p - 1))
    try {
      await (trpc.notification as any).excluir.mutate({ id: n.id })
    } catch {
      setItems(prev)
      fetchPendentes()
    } finally {
      setRemovendo(null)
    }
  }

  // Marca uma notificação como lida (mantém na lista mas com visual atenuado).
  // Otimismo: atualiza o flag local antes da resposta do backend.
  async function handleMarcarLida(n: Notification, e: React.MouseEvent) {
    e.stopPropagation()
    if (n.lida) return
    const prev = items
    setItems(curr => curr.map(x => x.id === n.id ? { ...x, lida: true, lidaEm: new Date().toISOString() } : x))
    setPendentes(p => Math.max(0, p - 1))
    try {
      await (trpc.notification as any).marcarComoLida.mutate({ id: n.id })
    } catch {
      setItems(prev)
      fetchPendentes()
    }
  }

  // Marca TODAS as não lidas como lidas em um único call.
  async function handleMarcarTodasLidas() {
    const naoLidas = items.filter(x => !x.lida)
    if (naoLidas.length === 0) return
    const prev = items
    const agora = new Date().toISOString()
    setItems(curr => curr.map(x => x.lida ? x : { ...x, lida: true, lidaEm: agora }))
    setPendentes(0)
    try {
      await (trpc.notification as any).marcarTodasComoLidas.mutate()
    } catch {
      setItems(prev)
      fetchPendentes()
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={cn(
          'relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors',
          pendentes > 0 && 'text-sky-600',
        )}
        aria-label={`${pendentes} pendência(s)`}
        title="Notificações"
      >
        {pendentes > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {pendentes > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-1 border-2 border-card">
            {pendentes > 99 ? '99+' : pendentes}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          data-state={closing ? 'closing' : 'open'}
          className="bell-popover absolute right-0 top-full mt-2 z-50 w-[360px] sm:w-[400px] rounded-lg border bg-card shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Pendências</span>
              {pendentes > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1.5 h-4 min-w-4">
                  {pendentes}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {items.some(n => !n.lida) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarcarTodasLidas}
                  className="h-7 text-[11px] gap-1 px-2"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={animatedClose}
                className="h-7 w-7"
                title="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Lista — agrupada por categoria (vencidos / vencendo / outros) */}
          <div className="max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 opacity-50 mb-2" />
                <p className="text-xs">Nenhuma pendência por aqui</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Tudo em dia!</p>
              </div>
            ) : (() => {
              // Ordena ASC por data de expiração — mais próximo do vencimento primeiro
              const sortByExp = (a: Notification, b: Notification) => getExpTime(a) - getExpTime(b)
              const vencidos = items.filter(n => classificarCert(n) === 'vencido').sort(sortByExp)
              const vencendo = items.filter(n => classificarCert(n) === 'vencendo').sort(sortByExp)
              const outros = items.filter(n => classificarCert(n) === null)

              const renderItem = (n: Notification) => {
                const cfg = TIPO_CONFIG[n.tipo] ?? TIPO_CONFIG.info!
                const Icon = cfg.icon
                return (
                  <li
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={cn(
                      'group/item flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 relative',
                      // Lidas ficam atenuadas — usuário diferencia rapidamente quais ainda exigem atenção
                      n.lida && 'opacity-60',
                    )}
                  >
                    {/* Pontinho azul à esquerda nas não lidas */}
                    {!n.lida && (
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-sky-500" />
                    )}
                    <div className={cn('shrink-0 flex h-7 w-7 items-center justify-center rounded-full border', cfg.bg, cfg.border)}>
                      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0 pr-12">
                      <p className={cn('text-[13px] leading-tight text-foreground', n.lida ? 'font-medium' : 'font-semibold')}>
                        {n.titulo}
                      </p>
                      {n.mensagem && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{formatRelativo(n.createdAt)}</span>
                        {n.origem && (
                          <span className="inline-flex items-center rounded-sm px-1 py-0 text-[9px] uppercase tracking-wider bg-muted text-muted-foreground">
                            {n.origem}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Botões de ação — aparecem no hover */}
                    <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      {!n.lida && (
                        <button
                          type="button"
                          onClick={(e) => handleMarcarLida(n, e)}
                          title="Marcar como lida"
                          aria-label="Marcar como lida"
                          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {n.removivel && (
                        <button
                          type="button"
                          onClick={(e) => handleExcluir(n, e)}
                          disabled={removendo === n.id}
                          title="Remover notificação"
                          aria-label="Remover notificação"
                          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
                        >
                          {removendo === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </li>
                )
              }

              return (
                <div>
                  {/* Seção: Vencidos (já expiraram ou vencem em ≤7 dias) */}
                  {vencidos.length > 0 && (
                    <>
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-1.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900">
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                            Vencidos / Crítico
                          </span>
                        </div>
                        <span className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 h-4 min-w-4">
                          {vencidos.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/60">{vencidos.map(renderItem)}</ul>
                    </>
                  )}

                  {/* Seção: Próximos a vencer (30 ou 60 dias) */}
                  {vencendo.length > 0 && (
                    <>
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            Próximos a vencer
                          </span>
                        </div>
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold px-1.5 h-4 min-w-4">
                          {vencendo.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/60">{vencendo.map(renderItem)}</ul>
                    </>
                  )}

                  {/* Seção: Outras pendências (não relacionadas a certificados) */}
                  {outros.length > 0 && (
                    <>
                      {(vencidos.length > 0 || vencendo.length > 0) && (
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-1.5 bg-muted/40 border-b">
                          <div className="flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Outras pendências
                            </span>
                          </div>
                          <span className="inline-flex items-center justify-center rounded-full bg-muted-foreground/80 text-white text-[10px] font-bold px-1.5 h-4 min-w-4">
                            {outros.length}
                          </span>
                        </div>
                      )}
                      <ul className="divide-y divide-border/60">{outros.map(renderItem)}</ul>
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
