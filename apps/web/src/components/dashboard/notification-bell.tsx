'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, X, Info, AlertTriangle, AlertCircle, CheckCircle2, Loader2, Check, CheckCheck } from 'lucide-react'
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

  // Aba ativa do painel (modelo LuminAux): Todos / Não lidas
  const [aba, setAba] = useState<'todas' | 'nao_lidas'>('todas')
  const visiveis = aba === 'nao_lidas' ? items.filter(n => !n.lida) : items
  const sortByExp = (a: Notification, b: Notification) => getExpTime(a) - getExpTime(b)
  const vencidos = visiveis.filter(n => classificarCert(n) === 'vencido').sort(sortByExp)
  const vencendo = visiveis.filter(n => classificarCert(n) === 'vencendo').sort(sortByExp)
  const outras = visiveis.filter(n => !classificarCert(n))
  const naoLidas = items.filter(n => !n.lida).length

  function renderItem(n: Notification) {
    const cfg = TIPO_CONFIG[n.tipo] ?? TIPO_CONFIG.info!
    const Icon = cfg.icon
    return (
      <li key={n.id}>
        <div
          role={n.link ? 'link' : undefined}
          onClick={() => handleClickItem(n)}
          className={cn(
            'group/item relative flex w-full items-start gap-3 overflow-hidden rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted',
            n.link && 'cursor-pointer',
            !n.lida && 'bg-primary/[0.06]',
          )}
        >
          {/* Ícone circular por tipo (o modelo usa bg-primary/10 + text-primary) */}
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', cfg.bg, cfg.color)}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn('truncate text-sm', n.lida ? 'font-medium text-foreground/80' : 'font-semibold text-foreground')}>{n.titulo}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelativo(n.createdAt)}</span>
            </span>
            {n.mensagem && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.mensagem}</span>}
            {n.origem && <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{n.origem}</span>}
          </span>
          {!n.lida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
          {/* Ações no hover: marcar lida / remover (quando o sistema permite) */}
          <span className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
            {!n.lida && (
              <button type="button" onClick={(e) => handleMarcarLida(n, e)} title="Marcar como lida"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-primary">
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            {n.removivel && (
              <button type="button" onClick={(e) => handleExcluir(n, e)} disabled={removendo === n.id} title="Remover"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-rose-600">
                {removendo === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            )}
          </span>
        </div>
      </li>
    )
  }

  function renderSecao(titulo: string, lista: Notification[], tom: string) {
    if (lista.length === 0) return null
    return (
      <li className="pt-2 first:pt-0">
        <p className={cn('px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide', tom)}>{titulo} · {lista.length}</p>
        <ul className="space-y-1">{lista.map(renderItem)}</ul>
      </li>
    )
  }

  return (
    <>
      {/* Gatilho — ícone do header no padrão do modelo (h-10 w-10, ícone h-5) */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
        aria-label={`${pendentes} pendência(s)`}
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {pendentes > 0 && (
          // Pulso do modelo: scale 1 → 1.15 → 1, 1.6s, infinito, ease-in-out
          <span className="header-badge-pulse absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#dc2626] px-1 text-[10px] font-bold text-white ring-2 ring-card dark:bg-[#f87171]">
            {pendentes > 9 ? '9+' : pendentes}
          </span>
        )}
      </button>

      {/* Drawer de notificações (modelo LuminAux): painel fixo à direita.
          Vai por PORTAL no body: o <header> tem backdrop-blur, que vira
          containing block de position:fixed e prenderia o drawer nos 64px. */}
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className={cn('fixed inset-0 z-[90] bg-black/30 transition-opacity duration-200', closing ? 'opacity-0' : 'opacity-100')}
            onClick={animatedClose}
            aria-hidden
          />
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Notificações"
            className={cn(
              'fixed inset-y-0 right-0 z-[100] flex w-[26rem] max-w-[90vw] flex-col bg-card shadow-xl transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)]',
              closing ? 'translate-x-full' : 'translate-x-0 animate-[drawerIn_.25s_cubic-bezier(.16,1,.3,1)]',
            )}
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Notificações</h2>
                {naoLidas > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{naoLidas}</span>
                )}
              </div>
              <button type="button" onClick={animatedClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Abas */}
            <div className="flex gap-1 border-b border-border px-3 py-2">
              {([['todas', 'Todos'], ['nao_lidas', 'Não lidas']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setAba(k)}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', aba === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  {label}{k === 'nao_lidas' && naoLidas > 0 ? ` (${naoLidas})` : ''}
                </button>
              ))}
            </div>
            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-2 nice-scrollbar">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : visiveis.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <CheckCheck className="mx-auto h-6 w-6 text-muted-foreground/50" />
                  <p className="mt-2 text-xs text-muted-foreground">{aba === 'nao_lidas' ? 'Nada por ler. Tudo em dia!' : 'Nenhuma notificação por aqui.'}</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {renderSecao('Vencidos / Crítico', vencidos, 'text-rose-600 dark:text-rose-400')}
                  {renderSecao('Vencendo', vencendo, 'text-amber-600 dark:text-amber-400')}
                  {(vencidos.length > 0 || vencendo.length > 0) ? renderSecao('Outras', outras, 'text-muted-foreground') : outras.map(renderItem)}
                </ul>
              )}
            </div>
            {/* Rodapé */}
            <div className="border-t border-border p-4">
              <Button variant="outline" className="w-full gap-2" onClick={handleMarcarTodasLidas} disabled={naoLidas === 0}>
                <CheckCheck className="h-4 w-4" /> Marcar tudo como lido
              </Button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
