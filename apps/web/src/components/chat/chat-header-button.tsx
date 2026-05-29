'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  MessageSquare, X, Send, Loader2, ArrowLeft, Search, Users, Paperclip,
  ImagePlus, Check, CheckCheck, MoreVertical, Edit2, Trash2, Smile, AtSign,
  Circle, ChevronDown,
} from 'lucide-react'
import { Button, Input, cn, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Sheet, SheetContent, SheetTitle } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { alerts } from '@/lib/alerts'

// ============================================================
// Tipos
// ============================================================

type ChatStatus = 'online' | 'ausente' | 'dnd' | 'invisible' | null

interface Participante {
  id: string
  name: string
  email: string
  image: string | null
  lastReadAt?: Date | string | null
}

interface UltimaMensagem {
  id: string
  conteudo: string
  autorId: string
  createdAt: Date | string
}

interface Conversa {
  id: string
  nome: string
  isGrupo: boolean
  ultimaMensagem: UltimaMensagem | null
  ultimaMensagemEm: Date | string | null
  participantes: Participante[]
  unreadCount: number
}

interface Reaction {
  id: string
  usuarioId: string
  emoji: string
}

interface Mensagem {
  id: string
  conversaId: string
  autorId: string
  conteudo: string
  createdAt: Date | string
  editedAt?: Date | string | null
  deletedAt?: Date | string | null
  anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }>
  reactions: Reaction[]
}

interface OnlineUser {
  id: string
  name: string
  email: string
  image: string | null
  lastActivityAt: Date | string | null
  lastActivityPath: string | null
  chatStatus?: ChatStatus
}

type Tab = 'pessoas' | 'conversas'

// ============================================================
// Helpers
// ============================================================

const STATUS_LABEL: Record<NonNullable<ChatStatus> | 'offline' | 'auto', string> = {
  online: 'Online',
  ausente: 'Ausente',
  dnd: 'Não perturbar',
  invisible: 'Invisível (parece offline)',
  offline: 'Offline',
  auto: 'Automático',
}

const STATUS_COR: Record<'online' | 'ausente' | 'dnd' | 'offline', string> = {
  online:  'bg-emerald-500',
  ausente: 'bg-amber-500',
  dnd:     'bg-rose-500',
  offline: 'bg-muted-foreground/40',
}

/** Resolve a presença visual a partir do chatStatus + lastActivityAt. */
function presencaEfetiva(u: { chatStatus?: ChatStatus; lastActivityAt?: Date | string | null }): 'online' | 'ausente' | 'dnd' | 'offline' {
  if (u.chatStatus === 'invisible') return 'offline'
  if (u.chatStatus === 'online' || u.chatStatus === 'ausente' || u.chatStatus === 'dnd') return u.chatStatus
  // Auto (chatStatus null/undefined) → deriva do lastActivityAt
  if (!u.lastActivityAt) return 'offline'
  const diff = Date.now() - new Date(u.lastActivityAt).getTime()
  if (diff < 2 * 60_000) return 'online'
  if (diff < 15 * 60_000) return 'ausente'
  return 'offline'
}

function initials(name: string): string {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

function timeRelative(d: Date | string | null | undefined): string {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

function timeHm(d: Date | string): string {
  const dd = new Date(d)
  return `${String(dd.getHours()).padStart(2, '0')}:${String(dd.getMinutes()).padStart(2, '0')}`
}

const EMOJI_QUICK = ['👍', '❤️', '😂', '😮', '😢', '👏']

// ============================================================
// Componente principal
// ============================================================

export function ChatHeaderButton() {
  const { profile } = useCurrentUserProfile()
  const meuId = profile?.id ?? null

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('conversas')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null)
  const [novoGrupoOpen, setNovoGrupoOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Meu status manual (null = auto)
  const [meuStatus, setMeuStatus] = useState<ChatStatus>(null)

  const totalUnread = useMemo(() => conversas.reduce((sum, c) => sum + c.unreadCount, 0), [conversas])

  // Reset estado interno quando o sheet fecha
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConversaAtiva(null)
      setNovoGrupoOpen(false)
    }
  }

  // ========== Carregamento ==========
  const loadConversas = useCallback(async () => {
    try {
      const r = await (trpc.chat as any).listConversas.query()
      setConversas(r as Conversa[])
    } catch { /* offline ou logout */ }
  }, [])

  const loadOnline = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/admin/online-users`, { credentials: 'include' })
      if (!r.ok) return
      const data = await r.json() as OnlineUser[]
      setOnlineUsers(data)
      // Detecta meu próprio status do payload
      if (meuId) {
        const eu = data.find(u => u.id === meuId)
        if (eu) setMeuStatus(eu.chatStatus ?? null)
      }
    } catch { /* ignora */ }
  }, [meuId])

  useEffect(() => {
    loadConversas()
    loadOnline()
    const i = setInterval(loadOnline, 30_000)
    return () => clearInterval(i)
  }, [loadConversas, loadOnline])

  // ========== Pedir permissão de notificação no 1º open ==========
  const pediuPermissaoRef = useRef(false)
  useEffect(() => {
    if (!open || pediuPermissaoRef.current) return
    pediuPermissaoRef.current = true
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [open])

  // ========== SSE global ==========
  useEffect(() => {
    if (!meuId) return
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/chat/events`, { withCredentials: true } as never)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data)
            if (ev.type === 'mensagem-nova') {
              loadConversas()
              if (conversaAtiva && ev.conversaId === conversaAtiva.id) {
                window.dispatchEvent(new CustomEvent('chat:mensagem-nova', { detail: ev }))
              } else {
                // Notificação browser quando painel fechado OU outra conversa
                showBrowserNotification(ev)
              }
            } else if (ev.type === 'mensagem-editada' || ev.type === 'mensagem-deletada' || ev.type === 'reaction-mudou' || ev.type === 'anexo-adicionado') {
              window.dispatchEvent(new CustomEvent('chat:' + ev.type, { detail: ev }))
            } else if (ev.type === 'lido' || ev.type === 'conversa-criada') {
              loadConversas()
              if (ev.type === 'lido') window.dispatchEvent(new CustomEvent('chat:lido', { detail: ev }))
            } else if (ev.type === 'typing') {
              window.dispatchEvent(new CustomEvent('chat:typing', { detail: ev }))
            } else if (ev.type === 'status-mudou') {
              loadOnline()
            }
          } catch { /* ignora */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retry = setTimeout(connect, 15_000)
        }
      } catch {
        if (!closed) retry = setTimeout(connect, 15_000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retry) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meuId, conversaAtiva?.id])

  function showBrowserNotification(ev: { conversaId: string; mensagem: Mensagem }) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    // Acha conversa pra pegar nome
    const conv = conversas.find(c => c.id === ev.conversaId)
    const autor = conv?.participantes.find(p => p.id === ev.mensagem.autorId)
    const titulo = conv?.isGrupo ? `${conv.nome} · ${autor?.name ?? 'Alguém'}` : (autor?.name ?? 'Nova mensagem')
    try {
      const n = new Notification(titulo, {
        body: ev.mensagem.conteudo.slice(0, 100),
        icon: '/logo.png',
        tag: ev.conversaId,
      })
      n.onclick = () => {
        window.focus()
        setOpen(true)
        const c = conversas.find(x => x.id === ev.conversaId)
        if (c) setConversaAtiva(c)
        n.close()
      }
    } catch { /* navegador pode bloquear */ }
  }

  // ========== Trocar status ==========
  async function trocarStatus(novo: ChatStatus) {
    setMeuStatus(novo)
    try {
      await (trpc.chat as any).setStatus.mutate({ status: novo })
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ========== Abrir DM ==========
  async function abrirDM(outroUserId: string) {
    try {
      const conv = await (trpc.chat as any).criarDM.mutate({ outroUserId })
      await loadConversas()
      const r = await (trpc.chat as any).listConversas.query() as Conversa[]
      const completa = r.find(c => c.id === conv.id)
      if (completa) setConversaAtiva(completa)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ========== Filtros ==========
  const pessoasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = onlineUsers
      .filter(u => u.id !== meuId)
      .map(u => ({ ...u, presenca: presencaEfetiva(u) }))
    all.sort((a, b) => {
      const order = { online: 0, ausente: 1, dnd: 2, offline: 3 }
      if (order[a.presenca] !== order[b.presenca]) return order[a.presenca] - order[b.presenca]
      return a.name.localeCompare(b.name)
    })
    return q ? all.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all
  }, [onlineUsers, search, meuId])

  const conversasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? conversas.filter(c => c.nome.toLowerCase().includes(q)) : conversas
  }, [conversas, search])

  // Minha presença efetiva (pra o dot no botão do header)
  const minhaPresenca: 'online' | 'ausente' | 'dnd' | 'offline' = useMemo(() => {
    const eu = onlineUsers.find(u => u.id === meuId)
    if (!eu) return meuStatus === 'online' ? 'online' : 'offline'
    return presencaEfetiva({ ...eu, chatStatus: meuStatus })
  }, [onlineUsers, meuId, meuStatus])

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      {/* Botão do header — mesmo padrão do sino */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors',
          totalUnread > 0 && 'text-sky-600',
        )}
        aria-label={`${totalUnread} mensagem(ns) não lida(s)`}
        title="Chat interno"
      >
        <MessageSquare className="h-4 w-4" />
        {/* Dot de status próprio */}
        <span
          className={cn(
            'absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-card transition-colors',
            STATUS_COR[minhaPresenca],
          )}
          title={`Status: ${STATUS_LABEL[minhaPresenca]}`}
        />
        {/* Badge de unread */}
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-1 border-2 border-card">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Sheet lateral — mesmo padrão de "Nova Oportunidade" em /crm */}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[540px] p-0 flex flex-col">
          <SheetTitle className="sr-only">Chat interno</SheetTitle>
          {conversaAtiva ? (
            <ChatView
              conversa={conversaAtiva}
              meuId={meuId}
              onClose={() => setConversaAtiva(null)}
              onMessageSent={loadConversas}
            />
          ) : novoGrupoOpen ? (
            <NovoGrupoView
              meuId={meuId}
              onlineUsers={onlineUsers}
              onCancel={() => setNovoGrupoOpen(false)}
              onCreated={(c) => { setNovoGrupoOpen(false); loadConversas(); setConversaAtiva(c) }}
            />
          ) : (
            <>
              {/* Header com meu status + abas */}
              <div className="border-b border-border bg-muted/30">
                {/* Linha 1: meu status */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-border/50">
                  <div className="text-[11px] text-muted-foreground">Meu status:</div>
                  <StatusDropdown statusManual={meuStatus} presencaAtual={minhaPresenca} onChange={trocarStatus} />
                </div>
                {/* Linha 2: abas */}
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setTab('conversas')}
                    className={cn(
                      'flex-1 py-2.5 text-sm font-medium transition-colors relative',
                      tab === 'conversas' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Conversas
                    {totalUnread > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                        {totalUnread}
                      </span>
                    )}
                    {tab === 'conversas' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('pessoas')}
                    className={cn(
                      'flex-1 py-2.5 text-sm font-medium transition-colors relative',
                      tab === 'pessoas' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Pessoas
                    {tab === 'pessoas' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />}
                  </button>
                </div>
              </div>

              {/* Search + criar grupo */}
              <div className="px-3 py-2 border-b border-border flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={tab === 'pessoas' ? 'Buscar pessoa…' : 'Buscar conversa…'}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                {tab === 'pessoas' && (
                  <button
                    type="button"
                    onClick={() => setNovoGrupoOpen(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-md bg-sky-500 hover:bg-sky-600 text-white"
                    title="Novo grupo"
                  >
                    <Users className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Lista */}
              <div className="flex-1 overflow-y-auto">
                {tab === 'pessoas' ? (
                  <PessoasList pessoas={pessoasFiltradas} onClickPessoa={abrirDM} />
                ) : (
                  <ConversasList conversas={conversasFiltradas} meuId={meuId} onClickConversa={setConversaAtiva} />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ============================================================
// StatusDropdown — meu status manual
// ============================================================

function StatusDropdown({ statusManual, presencaAtual, onChange }: {
  statusManual: ChatStatus
  presencaAtual: 'online' | 'ausente' | 'dnd' | 'offline'
  onChange: (s: ChatStatus) => void
}) {
  const labelAtual = statusManual ? STATUS_LABEL[statusManual] : `${STATUS_LABEL[presencaAtual]} (auto)`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium hover:bg-muted px-2 py-1 rounded-md transition-colors">
          <span className={cn('h-2 w-2 rounded-full', STATUS_COR[presencaAtual])} />
          {labelAtual}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {([
          { v: null,        label: 'Automático',           icon: '⏱️', cor: 'bg-muted-foreground/40' },
          { v: 'online',    label: 'Online',               icon: '🟢', cor: 'bg-emerald-500' },
          { v: 'ausente',   label: 'Ausente',              icon: '🟡', cor: 'bg-amber-500' },
          { v: 'dnd',       label: 'Não perturbar',        icon: '🔴', cor: 'bg-rose-500' },
          { v: 'invisible', label: 'Invisível',            icon: '⚫', cor: 'bg-muted-foreground/40' },
        ] as const).map(opt => (
          <DropdownMenuItem
            key={String(opt.v)}
            onClick={() => onChange(opt.v as ChatStatus)}
            className={cn('text-xs gap-2 cursor-pointer', statusManual === opt.v && 'bg-muted')}
          >
            <span className={cn('h-2 w-2 rounded-full', opt.cor)} />
            {opt.label}
            {statusManual === opt.v && <Check className="h-3 w-3 ml-auto text-sky-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================================
// Avatar
// ============================================================

function Avatar({ user, presenca }: { user: { name: string; image: string | null }; presenca?: 'online' | 'ausente' | 'dnd' | 'offline' }) {
  return (
    <div className="relative h-9 w-9 shrink-0">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveAssetUrl(user.image)} alt={user.name} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
          {initials(user.name)}
        </div>
      )}
      {presenca && (
        <span className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card', STATUS_COR[presenca])} />
      )}
    </div>
  )
}

function PessoasList({ pessoas, onClickPessoa }: {
  pessoas: Array<OnlineUser & { presenca: 'online' | 'ausente' | 'dnd' | 'offline' }>
  onClickPessoa: (id: string) => void
}) {
  if (pessoas.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Nenhuma pessoa encontrada.</div>
  }
  return (
    <ul className="py-1">
      {pessoas.map(u => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => onClickPessoa(u.id)}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
          >
            <Avatar user={u} presenca={u.presenca} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {u.presenca === 'online' && u.lastActivityPath ? u.lastActivityPath : STATUS_LABEL[u.presenca]}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ConversasList({ conversas, meuId, onClickConversa }: {
  conversas: Conversa[]
  meuId: string | null
  onClickConversa: (c: Conversa) => void
}) {
  if (conversas.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Sem conversas ainda. Vá em <strong>Pessoas</strong> pra começar.</div>
  }
  return (
    <ul className="py-1">
      {conversas.map(c => {
        const outro = !c.isGrupo ? c.participantes.find(p => p.id !== meuId) : null
        const preview = c.ultimaMensagem?.conteudo ?? '—'
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onClickConversa(c)}
              className="w-full px-3 py-2.5 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/40 last:border-b-0"
            >
              {c.isGrupo ? (
                <div className="h-9 w-9 shrink-0 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
              ) : outro ? (
                <Avatar user={outro} />
              ) : null}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold truncate">{c.nome}</div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeRelative(c.ultimaMensagemEm)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className={cn('text-[12px] truncate', c.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                    {preview}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// ChatView — abre uma conversa específica (com edit/delete/reactions/mentions/infinite scroll)
// ============================================================

function ChatView({ conversa, meuId, onClose, onMessageSent }: {
  conversa: Conversa
  meuId: string | null
  onClose: () => void
  onMessageSent: () => void
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMais, setLoadingMais] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [participantes, setParticipantes] = useState<Participante[]>(conversa.participantes)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const [anexosPendentes, setAnexosPendentes] = useState<Array<{ id: string; fileName: string; fileUrl: string; mimeType: string; tamanho: number; uploading?: boolean }>>([])
  const [typingUsers, setTypingUsers] = useState<Map<string, { nome: string; ts: number }>>(new Map())
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [mentionState, setMentionState] = useState<{ open: boolean; query: string; start: number } | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastTypingSentRef = useRef<number>(0)

  // ========== Carrega últimas mensagens ==========
  const loadMensagens = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.chat as any).listMensagens.query({ conversaId: conversa.id, take: 50 })
      const data = r as { mensagens: Mensagem[]; hasMore: boolean }
      setMensagens(data.mensagens)
      setHasMore(data.hasMore)
      await (trpc.chat as any).marcarLido.mutate({ conversaId: conversa.id }).catch(() => {})
      onMessageSent()
    } finally { setLoading(false) }
  }, [conversa.id, onMessageSent])

  useEffect(() => { loadMensagens() }, [loadMensagens])

  // Auto-scroll pro fim quando mensagens iniciais carregam ou nova chega
  const prevLenRef = useRef(0)
  useEffect(() => {
    if (mensagens.length === 0) return
    // Se mudou só por loadMais (msgs antigas adicionadas no início), não scroll
    if (mensagens.length > prevLenRef.current && mensagens[mensagens.length - 1]?.id !== mensagens[prevLenRef.current - 1]?.id) {
      bottomRef.current?.scrollIntoView({ behavior: prevLenRef.current === 0 ? 'auto' : 'smooth' })
    }
    prevLenRef.current = mensagens.length
  }, [mensagens])

  // ========== Infinite scroll up ==========
  async function carregarMaisAntigas() {
    if (loadingMais || !hasMore || mensagens.length === 0) return
    setLoadingMais(true)
    const cursor = mensagens[0]!.id
    const scrollEl = scrollRef.current
    const prevHeight = scrollEl?.scrollHeight ?? 0
    try {
      const r = await (trpc.chat as any).listMensagens.query({ conversaId: conversa.id, cursor, take: 50 })
      const data = r as { mensagens: Mensagem[]; hasMore: boolean }
      setMensagens(prev => [...data.mensagens, ...prev])
      setHasMore(data.hasMore)
      // Preserva posição de scroll após injeção no topo
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight
      })
    } finally { setLoadingMais(false) }
  }

  function handleScroll() {
    if (!scrollRef.current) return
    if (scrollRef.current.scrollTop < 50 && hasMore && !loadingMais) {
      carregarMaisAntigas()
    }
  }

  // ========== SSE listeners ==========
  useEffect(() => {
    function onNova(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; mensagem: Mensagem }
      if (ev.conversaId !== conversa.id) return
      setMensagens(prev => prev.find(m => m.id === ev.mensagem.id) ? prev : [...prev, ev.mensagem])
      ;(trpc.chat as any).marcarLido.mutate({ conversaId: conversa.id }).catch(() => {})
      onMessageSent()
    }
    function onEditada(e: Event) {
      const ev = (e as CustomEvent).detail as { mensagem: Mensagem }
      setMensagens(prev => prev.map(m => m.id === ev.mensagem.id ? ev.mensagem : m))
    }
    function onDeletada(e: Event) {
      const ev = (e as CustomEvent).detail as { mensagemId: string }
      setMensagens(prev => prev.map(m => m.id === ev.mensagemId ? { ...m, deletedAt: new Date().toISOString() } : m))
    }
    function onReaction(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string }
      if (ev.conversaId !== conversa.id) return
      // Recarrega só a última página pra pegar reactions atualizadas (não-otimizado, mas simples)
      loadMensagens()
    }
    function onLido(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; usuarioId: string; lidoEm: string }
      if (ev.conversaId !== conversa.id) return
      setParticipantes(prev => prev.map(p => p.id === ev.usuarioId ? { ...p, lastReadAt: ev.lidoEm } : p))
    }
    function onTyping(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; usuarioId: string; nome: string }
      if (ev.conversaId !== conversa.id) return
      setTypingUsers(prev => {
        const next = new Map(prev)
        const part = participantes.find(p => p.id === ev.usuarioId)
        next.set(ev.usuarioId, { nome: ev.nome || part?.name || 'Alguém', ts: Date.now() })
        return next
      })
    }
    window.addEventListener('chat:mensagem-nova', onNova)
    window.addEventListener('chat:mensagem-editada', onEditada)
    window.addEventListener('chat:mensagem-deletada', onDeletada)
    window.addEventListener('chat:reaction-mudou', onReaction)
    window.addEventListener('chat:lido', onLido)
    window.addEventListener('chat:typing', onTyping)
    return () => {
      window.removeEventListener('chat:mensagem-nova', onNova)
      window.removeEventListener('chat:mensagem-editada', onEditada)
      window.removeEventListener('chat:mensagem-deletada', onDeletada)
      window.removeEventListener('chat:reaction-mudou', onReaction)
      window.removeEventListener('chat:lido', onLido)
      window.removeEventListener('chat:typing', onTyping)
    }
  }, [conversa.id, participantes, loadMensagens, onMessageSent])

  // Limpa typing após 4s
  useEffect(() => {
    const i = setInterval(() => {
      setTypingUsers(prev => {
        const cutoff = Date.now() - 4_000
        const next = new Map(prev)
        for (const [k, v] of next) if (v.ts < cutoff) next.delete(k)
        return next
      })
    }, 1_000)
    return () => clearInterval(i)
  }, [])

  // ========== Upload anexo ==========
  async function uploadFile(file: File | Blob, fallbackName?: string) {
    const fileName = (file as File).name || fallbackName || `print-${Date.now()}.png`
    const mimeType = file.type || 'image/png'
    const placeholderId = crypto.randomUUID()
    setAnexosPendentes(prev => [...prev, { id: placeholderId, fileName, fileUrl: '', mimeType, tamanho: file.size, uploading: true }])
    try {
      const fd = new FormData()
      fd.append('file', file, fileName)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (${res.status})`)
      const data = await res.json() as { url: string }
      setAnexosPendentes(prev => prev.map(a => a.id === placeholderId
        ? { id: placeholderId, fileName, fileUrl: data.url, mimeType, tamanho: file.size }
        : a))
    } catch (e) {
      setAnexosPendentes(prev => prev.filter(a => a.id !== placeholderId))
      alerts.error('Erro', (e as Error).message)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (blob) {
          const ext = item.type.split('/')[1] || 'png'
          uploadFile(blob, `print-${Date.now()}.${ext}`)
        }
      }
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    for (const f of Array.from(e.target.files ?? [])) uploadFile(f)
    e.target.value = ''
  }

  function notifyTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3_000) return
    lastTypingSentRef.current = now
    fetch(`${getApiUrl()}/api/chat/typing/${conversa.id}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: '' }),
    }).catch(() => {})
  }

  // ========== Detecta @ no textarea pra abrir mention picker ==========
  function onTextChange(value: string, cursor: number) {
    setTexto(value)
    notifyTyping()
    // Procura por @ não fechado antes do cursor
    const ate = value.slice(0, cursor)
    const m = ate.match(/@(\w*)$/)
    if (m) {
      setMentionState({ open: true, query: m[1] ?? '', start: cursor - m[0].length })
    } else {
      setMentionState(null)
    }
  }

  function selecionarMention(p: Participante) {
    if (!mentionState) return
    const before = texto.slice(0, mentionState.start)
    const after = texto.slice(mentionState.start + 1 + mentionState.query.length)
    const novoTexto = `${before}<@${p.id}>${after} `
    setTexto(novoTexto)
    setMentionState(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // ========== Enviar ==========
  async function enviar() {
    const conteudo = texto.trim()
    if (!conteudo && anexosPendentes.length === 0) return
    if (anexosPendentes.some(a => a.uploading)) {
      alerts.error('Aguarde', 'Anexos ainda enviando…')
      return
    }
    setEnviando(true)
    try {
      const msgConteudo = conteudo || '(anexo)'
      const msg = await (trpc.chat as any).enviar.mutate({ conversaId: conversa.id, conteudo: msgConteudo }) as Mensagem
      for (const a of anexosPendentes) {
        if (!a.fileUrl) continue
        await (trpc.chat as any).addAnexo.mutate({
          mensagemId: msg.id, fileName: a.fileName, fileUrl: a.fileUrl, mimeType: a.mimeType, tamanho: a.tamanho,
        }).catch(() => {})
      }
      setMensagens(prev => [...prev, { ...msg, anexos: [], reactions: [] }])
      setTexto('')
      setAnexosPendentes([])
      setMentionState(null)
      onMessageSent()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionState && (e.key === 'Escape' || e.key === 'Tab')) {
      e.preventDefault()
      setMentionState(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  // ========== Editar / Deletar ==========
  function iniciarEdicao(m: Mensagem) {
    setEditandoId(m.id)
    setEditTexto(m.conteudo)
  }
  async function salvarEdicao(m: Mensagem) {
    const conteudo = editTexto.trim()
    if (!conteudo || conteudo === m.conteudo) {
      setEditandoId(null)
      return
    }
    try {
      const atualizada = await (trpc.chat as any).editarMensagem.mutate({ mensagemId: m.id, conteudo }) as Mensagem
      setMensagens(prev => prev.map(x => x.id === m.id ? atualizada : x))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEditandoId(null) }
  }
  async function deletar(m: Mensagem) {
    const ok = await alerts.confirm({ title: 'Apagar mensagem?', text: 'Outras pessoas vão ver "mensagem apagada".', confirmText: 'Apagar', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.chat as any).deletarMensagem.mutate({ mensagemId: m.id })
      setMensagens(prev => prev.map(x => x.id === m.id ? { ...x, deletedAt: new Date().toISOString() } : x))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function toggleReaction(m: Mensagem, emoji: string) {
    try {
      await (trpc.chat as any).toggleReaction.mutate({ mensagemId: m.id, emoji })
      setEmojiPickerFor(null)
      // SSE vai disparar reaction-mudou → recarrega
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ========== Renderização de mensagem com mentions ==========
  function renderConteudo(texto: string): React.ReactNode {
    // Substitui <@userId> por nome do participante
    const parts: React.ReactNode[] = []
    const regex = /<@([a-z0-9]+)>/gi
    let lastIdx = 0
    let match: RegExpExecArray | null
    let i = 0
    while ((match = regex.exec(texto)) !== null) {
      if (match.index > lastIdx) parts.push(texto.slice(lastIdx, match.index))
      const userId = match[1]!
      const part = participantes.find(p => p.id === userId)
      parts.push(
        <span key={`m-${i++}`} className="font-semibold text-sky-300 bg-sky-500/20 rounded px-1">
          @{part?.name ?? 'usuário'}
        </span>,
      )
      lastIdx = match.index + match[0].length
    }
    if (lastIdx < texto.length) parts.push(texto.slice(lastIdx))
    return parts
  }

  // ========== "Lido por todos" em grupo ==========
  function foiLidaPorTodos(m: Mensagem, ehMinha: boolean): boolean {
    if (!ehMinha) return false
    const outros = participantes.filter(p => p.id !== meuId)
    if (outros.length === 0) return false
    return outros.every(p => p.lastReadAt && new Date(p.lastReadAt) >= new Date(m.createdAt))
  }

  // ========== Mention popup helpers ==========
  const mentionMatches = useMemo(() => {
    if (!mentionState) return []
    const q = mentionState.query.toLowerCase()
    return participantes
      .filter(p => p.id !== meuId)
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .slice(0, 5)
  }, [mentionState, participantes, meuId])

  const typingNames = Array.from(typingUsers.values()).map(t => t.nome)

  return (
    <>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-muted/30">
        <button type="button" onClick={onClose} className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {conversa.isGrupo ? (
          <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center">
            <Users className="h-4 w-4" />
          </div>
        ) : (() => {
          const outro = participantes.find(p => p.id !== meuId)
          if (!outro) return null
          return <Avatar user={outro} />
        })()}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{conversa.nome}</div>
          {typingNames.length > 0 ? (
            <div className="text-[11px] text-sky-600 dark:text-sky-400 italic">
              {typingNames.length === 1 ? `${typingNames[0]} está digitando…` : `${typingNames.length} pessoas digitando…`}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground truncate">
              {conversa.isGrupo ? `${participantes.length} membros` : (
                participantes.find(p => p.id !== meuId)?.email ?? ''
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-muted/10 relative">
        {loadingMais && (
          <div className="text-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground inline" /></div>
        )}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">Comece a conversa…</div>
        ) : (
          mensagens.map((m, idx) => {
            const ehMinha = m.autorId === meuId
            const autorPart = !ehMinha ? participantes.find(p => p.id === m.autorId) : null
            const showAvatar = !ehMinha && (idx === 0 || mensagens[idx - 1]?.autorId !== m.autorId)
            const foiLida = foiLidaPorTodos(m, ehMinha)
            const isEditando = editandoId === m.id
            const isDeletada = !!m.deletedAt
            // Agrupa reactions por emoji — IIFE (não pode ser useMemo dentro de .map,
            // viola regra dos hooks: quando chega mensagem-nova via SSE, o número de
            // iterações muda e React quebra com error #310).
            const reactionsAgrupadas = (() => {
              const map = new Map<string, { count: number; users: string[]; reagi: boolean }>()
              for (const r of m.reactions ?? []) {
                const cur = map.get(r.emoji) ?? { count: 0, users: [], reagi: false }
                cur.count++
                cur.users.push(r.usuarioId)
                if (r.usuarioId === meuId) cur.reagi = true
                map.set(r.emoji, cur)
              }
              return Array.from(map.entries())
            })()

            return (
              <div key={m.id} className={cn('flex gap-2 group/msg relative', ehMinha ? 'justify-end' : 'justify-start')}>
                {!ehMinha && (
                  <div className="w-7 shrink-0">
                    {showAvatar && autorPart && (
                      autorPart.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveAssetUrl(autorPart.image)} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                          {initials(autorPart.name)}
                        </div>
                      )
                    )}
                  </div>
                )}
                <div className={cn('max-w-[75%] flex flex-col', ehMinha ? 'items-end' : 'items-start')}>
                  {conversa.isGrupo && !ehMinha && showAvatar && autorPart && (
                    <div className="text-[10px] text-muted-foreground font-medium mb-0.5 px-2">{autorPart.name}</div>
                  )}
                  <div className={cn(
                    'rounded-2xl px-3 py-1.5 text-sm leading-snug break-words relative',
                    ehMinha ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
                    isDeletada && 'italic opacity-60',
                  )}>
                    {isEditando ? (
                      <div className="flex flex-col gap-1">
                        <textarea
                          value={editTexto}
                          onChange={e => setEditTexto(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setEditandoId(null)
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarEdicao(m) }
                          }}
                          autoFocus
                          rows={2}
                          className="text-foreground rounded px-2 py-1 text-sm resize-none bg-background w-[260px]"
                        />
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setEditandoId(null)} className="text-[10px] opacity-70 hover:opacity-100">Cancelar</button>
                          <button type="button" onClick={() => salvarEdicao(m)} className="text-[10px] font-semibold">Salvar (Enter)</button>
                        </div>
                      </div>
                    ) : isDeletada ? (
                      'mensagem apagada'
                    ) : (
                      <>
                        {renderConteudo(m.conteudo)}
                        {m.editedAt && <span className="text-[9px] opacity-50 ml-1">(editado)</span>}
                        {m.anexos.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {m.anexos.map(a => (
                              a.mimeType?.startsWith('image/') ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={a.id} src={resolveAssetUrl(a.fileUrl)} alt={a.fileName} className="max-h-48 rounded-md" />
                              ) : (
                                <a key={a.id} href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer"
                                  className={cn('flex items-center gap-1.5 text-xs underline truncate', ehMinha ? 'text-white/90' : 'text-sky-600')}>
                                  <Paperclip className="h-3 w-3" />{a.fileName}
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Reactions */}
                  {reactionsAgrupadas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 px-1">
                      {reactionsAgrupadas.map(([emoji, info]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleReaction(m, emoji)}
                          className={cn(
                            'inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors',
                            info.reagi
                              ? 'bg-sky-100 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                              : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                          )}
                        >
                          <span>{emoji}</span>
                          <span className="font-semibold">{info.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp + check */}
                  <div className={cn('text-[10px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1', ehMinha && 'flex-row-reverse')}>
                    {timeHm(m.createdAt)}
                    {ehMinha && !isDeletada && (foiLida
                      ? <CheckCheck className="h-3 w-3 text-sky-500" />
                      : <Check className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Menu de ações no hover */}
                {!isEditando && !isDeletada && (
                  <div className={cn(
                    'absolute top-0 z-10 opacity-0 group-hover/msg:opacity-100 transition-opacity flex gap-0.5 bg-card border border-border rounded-md shadow-md px-1 py-0.5',
                    ehMinha ? 'right-10' : 'left-10',
                  )}>
                    <button type="button" onClick={() => setEmojiPickerFor(emojiPickerFor === m.id ? null : m.id)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded" title="Reagir">
                      <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    {ehMinha && (
                      <>
                        <button type="button" onClick={() => iniciarEdicao(m)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded" title="Editar">
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button type="button" onClick={() => deletar(m)} className="h-6 w-6 flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:text-rose-600 rounded" title="Apagar">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Emoji picker popover */}
                {emojiPickerFor === m.id && (
                  <div className={cn('absolute top-6 z-20 bg-card border border-border rounded-md shadow-lg p-1 flex gap-0.5', ehMinha ? 'right-10' : 'left-10')}>
                    {EMOJI_QUICK.map(e => (
                      <button key={e} type="button" onClick={() => toggleReaction(m, e)} className="h-7 w-7 flex items-center justify-center hover:bg-muted rounded text-lg">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Anexos pendentes */}
      {anexosPendentes.length > 0 && (
        <div className="px-3 py-2 border-t border-border flex flex-wrap gap-2">
          {anexosPendentes.map(a => (
            <div key={a.id} className="relative h-14 w-14 rounded border border-border bg-muted/40 overflow-hidden">
              {a.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : a.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(a.fileUrl)} alt={a.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                </div>
              )}
              {!a.uploading && (
                <button type="button" onClick={() => setAnexosPendentes(p => p.filter(x => x.id !== a.id))}
                  className="absolute top-0 right-0 h-4 w-4 bg-rose-500 text-white rounded-bl flex items-center justify-center">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-border bg-card flex items-end gap-2 relative">
        {/* Mention picker — popup acima do input */}
        {mentionState?.open && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-card border border-border rounded-md shadow-lg overflow-hidden z-10">
            {mentionMatches.map(p => (
              <button key={p.id} type="button" onClick={() => selecionarMention(p)}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted/50 text-left">
                <AtSign className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="h-8 w-8 rounded hover:bg-muted flex items-center justify-center text-muted-foreground" title="Anexar">
          <ImagePlus className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,application/*" multiple onChange={handleFilePick} className="hidden" />
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => onTextChange(e.target.value, e.target.selectionStart)}
          onSelect={e => onTextChange((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart)}
          onPaste={handlePaste}
          onKeyDown={onKey}
          rows={1}
          placeholder="Mensagem… (digite @ pra mencionar)"
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 max-h-24"
        />
        <Button size="sm" onClick={enviar} disabled={enviando || (!texto.trim() && anexosPendentes.length === 0)}
          className="h-8 w-8 p-0 bg-sky-500 hover:bg-sky-600 text-white">
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </>
  )
}

// ============================================================
// NovoGrupoView
// ============================================================

function NovoGrupoView({ meuId, onlineUsers, onCancel, onCreated }: {
  meuId: string | null
  onlineUsers: OnlineUser[]
  onCancel: () => void
  onCreated: (c: Conversa) => void
}) {
  const [nome, setNome] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const disponiveis = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = onlineUsers.filter(u => u.id !== meuId)
    return q ? all.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all
  }, [onlineUsers, search, meuId])

  function toggle(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function criar() {
    if (!nome.trim() || selecionados.length === 0) return
    setSaving(true)
    try {
      const conv = await (trpc.chat as any).criarGrupo.mutate({ nome: nome.trim(), membrosIds: selecionados }) as Conversa
      onCreated(conv)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-muted/30">
        <button type="button" onClick={onCancel} className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold">Novo grupo</div>
      </div>
      <div className="px-3 py-3 space-y-2 border-b border-border">
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do grupo" className="h-8 text-sm" autoFocus maxLength={80} />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pessoa…" className="h-8 pl-8 text-xs" />
        </div>
        <div className="text-[11px] text-muted-foreground">{selecionados.length} selecionado(s)</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {disponiveis.map(u => {
          const sel = selecionados.includes(u.id)
          return (
            <button key={u.id} type="button" onClick={() => toggle(u.id)}
              className={cn('w-full px-3 py-2 flex items-center gap-3 hover:bg-muted/50 text-left', sel && 'bg-sky-50 dark:bg-sky-950/30')}>
              <span className={cn('h-4 w-4 rounded border flex items-center justify-center shrink-0',
                sel ? 'bg-sky-500 border-sky-500 text-white' : 'border-muted-foreground/40')}>
                {sel && <Check className="h-3 w-3" />}
              </span>
              <Avatar user={u} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
              </div>
            </button>
          )
        })}
      </div>
      <div className="px-3 py-2.5 border-t border-border flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={criar} disabled={saving || !nome.trim() || selecionados.length === 0}
          className="bg-sky-500 hover:bg-sky-600 text-white">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Criar grupo
        </Button>
      </div>
    </>
  )
}
