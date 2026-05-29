'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  MessageSquare, X, Send, Loader2, ArrowLeft, Search, Users, Plus, Paperclip,
  ImagePlus, Check, CheckCheck,
} from 'lucide-react'
import { Button, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { alerts } from '@/lib/alerts'

// ============================================================
// Tipos
// ============================================================

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

interface Mensagem {
  id: string
  conversaId: string
  autorId: string
  conteudo: string
  createdAt: Date | string
  editedAt?: Date | string | null
  anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }>
}

interface OnlineUser {
  id: string
  name: string
  email: string
  image: string | null
  lastActivityAt: Date | string | null
  lastActivityPath: string | null
}

type Tab = 'pessoas' | 'conversas'

// ============================================================
// Helpers
// ============================================================

function presencaDe(lastActivityAt: Date | string | null | undefined): 'online' | 'ausente' | 'offline' {
  if (!lastActivityAt) return 'offline'
  const diff = Date.now() - new Date(lastActivityAt).getTime()
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

// ============================================================
// Componente principal
// ============================================================

export function FloatingChatButton() {
  const { profile } = useCurrentUserProfile()
  const meuId = profile?.id ?? null

  const [open, setOpen] = useState(false)
  const [entered, setEntered] = useState(false)
  const [tab, setTab] = useState<Tab>('conversas')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null)
  const [novoGrupoOpen, setNovoGrupoOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Total de não-lidas (badge no FAB) — derivado de conversas
  const totalUnread = useMemo(() => conversas.reduce((sum, c) => sum + c.unreadCount, 0), [conversas])

  const popoverRef = useRef<HTMLDivElement>(null)

  // ========== Toggle animado ==========
  function toggle(next: boolean) {
    if (next) {
      setOpen(true)
      setEntered(false)
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    } else if (open) {
      setEntered(false)
      setTimeout(() => {
        setOpen(false)
        setConversaAtiva(null)
        setNovoGrupoOpen(false)
      }, 200)
    }
  }

  // ========== Fecha ao clicar fora ==========
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        const fabBtn = document.getElementById('floating-chat-button')
        if (fabBtn?.contains(e.target as Node)) return
        toggle(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ========== Carregamento de conversas + lista online ==========
  const loadConversas = useCallback(async () => {
    try {
      const r = await (trpc.chat as any).listConversas.query()
      setConversas(r as Conversa[])
    } catch (e) { /* offline ou logout */ }
  }, [])

  const loadOnline = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/admin/online-users`, { credentials: 'include' })
      if (!r.ok) return
      const data = await r.json() as OnlineUser[]
      setOnlineUsers(data)
    } catch { /* ignora */ }
  }, [])

  useEffect(() => {
    loadConversas()
    loadOnline()
    const i = setInterval(loadOnline, 30_000)  // refresh presença a cada 30s
    return () => clearInterval(i)
  }, [loadConversas, loadOnline])

  // ========== SSE global do chat — atualiza badge mesmo com painel fechado ==========
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
              // Se for a conversa ativa, dispara reload de mensagens via custom event
              if (conversaAtiva && ev.conversaId === conversaAtiva.id) {
                window.dispatchEvent(new CustomEvent('chat:mensagem-nova', { detail: ev }))
              }
            } else if (ev.type === 'lido' || ev.type === 'conversa-criada') {
              loadConversas()
            } else if (ev.type === 'anexo-adicionado' || ev.type === 'typing') {
              window.dispatchEvent(new CustomEvent('chat:' + ev.type, { detail: ev }))
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
  }, [meuId, conversaAtiva, loadConversas])

  // ========== Abrir DM (vem da aba Pessoas) ==========
  async function abrirDM(outroUserId: string) {
    try {
      const conv = await (trpc.chat as any).criarDM.mutate({ outroUserId })
      await loadConversas()
      // Garante que a conversa carregada agora bate (precisa do unreadCount etc — recarrega)
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
      .map(u => ({ ...u, presenca: presencaDe(u.lastActivityAt) }))
    // Ordena: online primeiro, depois ausente, depois alfabético
    all.sort((a, b) => {
      const order = { online: 0, ausente: 1, offline: 2 }
      if (order[a.presenca] !== order[b.presenca]) return order[a.presenca] - order[b.presenca]
      return a.name.localeCompare(b.name)
    })
    return q ? all.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all
  }, [onlineUsers, search, meuId])

  const conversasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? conversas.filter(c => c.nome.toLowerCase().includes(q)) : conversas
  }, [conversas, search])

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      {/* FAB chat — ao lado do "Fale com a TI" */}
      <button
        id="floating-chat-button"
        type="button"
        onClick={() => toggle(!open)}
        aria-label="Chat interno"
        title="Chat interno"
        className={cn(
          'fixed bottom-5 right-[72px] z-50 h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center text-white',
          'bg-sky-500 hover:bg-sky-600 hover:scale-105 active:scale-95',
          'transition-all duration-200 ease-out',
          open && 'ring-2 ring-offset-2 ring-sky-500 ring-offset-background rotate-90',
        )}
      >
        <span className="relative h-5 w-5">
          <MessageSquare
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-0 scale-50 rotate-90' : 'opacity-100 scale-100 rotate-0',
            )}
          />
          <X
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90',
            )}
          />
        </span>
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-background">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <div
          ref={popoverRef}
          className={cn(
            'fixed bottom-20 right-5 z-50 w-[380px] h-[600px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-7rem)]',
            'rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col',
            'origin-bottom-right transition-all duration-200 ease-out',
            entered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2',
          )}
        >
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
              {/* Header com abas */}
              <div className="flex items-center border-b border-border bg-muted/30">
                <button
                  type="button"
                  onClick={() => setTab('conversas')}
                  className={cn(
                    'flex-1 py-3 text-sm font-medium transition-colors relative',
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
                    'flex-1 py-3 text-sm font-medium transition-colors relative',
                    tab === 'pessoas' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Pessoas
                  {tab === 'pessoas' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />}
                </button>
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
        </div>
      )}
    </>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

function StatusDot({ presenca }: { presenca: 'online' | 'ausente' | 'offline' }) {
  const cls = presenca === 'online'
    ? 'bg-emerald-500'
    : presenca === 'ausente'
      ? 'bg-amber-500'
      : 'bg-muted-foreground/40'
  return <span className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card', cls)} />
}

function Avatar({ user, presenca }: { user: { name: string; image: string | null }; presenca?: 'online' | 'ausente' | 'offline' }) {
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
      {presenca && <StatusDot presenca={presenca} />}
    </div>
  )
}

function PessoasList({ pessoas, onClickPessoa }: {
  pessoas: Array<OnlineUser & { presenca: 'online' | 'ausente' | 'offline' }>
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
                {u.presenca === 'online' && u.lastActivityPath ? u.lastActivityPath : (
                  u.presenca === 'ausente' ? 'Ausente' : u.presenca === 'offline' ? 'Offline' : 'Online'
                )}
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
// ChatView — abre uma conversa específica
// ============================================================

function ChatView({ conversa, meuId, onClose, onMessageSent }: {
  conversa: Conversa
  meuId: string | null
  onClose: () => void
  onMessageSent: () => void
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [anexosPendentes, setAnexosPendentes] = useState<Array<{ id: string; fileName: string; fileUrl: string; mimeType: string; tamanho: number; uploading?: boolean }>>([])
  const [typingUsers, setTypingUsers] = useState<Map<string, { nome: string; ts: number }>>(new Map())

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef<number>(0)

  // Carrega mensagens
  const loadMensagens = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.chat as any).listMensagens.query({ conversaId: conversa.id, take: 50 })
      setMensagens(r as Mensagem[])
      // Marca como lido
      await (trpc.chat as any).marcarLido.mutate({ conversaId: conversa.id }).catch(() => {})
      onMessageSent()  // refresh contador
    } finally { setLoading(false) }
  }, [conversa.id, onMessageSent])

  useEffect(() => { loadMensagens() }, [loadMensagens])

  // Auto-scroll pro fim quando mensagens mudam
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  // Escuta SSE custom events pra mensagens novas + typing
  useEffect(() => {
    function onNova(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; mensagem: Mensagem }
      if (ev.conversaId !== conversa.id) return
      setMensagens(prev => prev.find(m => m.id === ev.mensagem.id) ? prev : [...prev, ev.mensagem])
      ;(trpc.chat as any).marcarLido.mutate({ conversaId: conversa.id }).catch(() => {})
      onMessageSent()
    }
    function onTyping(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; usuarioId: string; nome: string }
      if (ev.conversaId !== conversa.id) return
      setTypingUsers(prev => {
        const next = new Map(prev)
        next.set(ev.usuarioId, { nome: ev.nome, ts: Date.now() })
        return next
      })
    }
    window.addEventListener('chat:mensagem-nova', onNova)
    window.addEventListener('chat:typing', onTyping)
    return () => {
      window.removeEventListener('chat:mensagem-nova', onNova)
      window.removeEventListener('chat:typing', onTyping)
    }
  }, [conversa.id, onMessageSent])

  // Limpa typing após 4s sem update
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

  // Upload de anexo
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
    if (now - lastTypingSentRef.current < 3_000) return  // throttle 3s
    lastTypingSentRef.current = now
    fetch(`${getApiUrl()}/api/chat/typing/${conversa.id}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: '' }),
    }).catch(() => {})
  }

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
      setMensagens(prev => [...prev, { ...msg, anexos: [] }])
      setTexto('')
      setAnexosPendentes([])
      onMessageSent()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    } else {
      notifyTyping()
    }
  }

  // Computar quem leu até onde — pra checkmark duplo (1:1 = só checa o outro participante)
  const lidoAteEm = useMemo(() => {
    if (conversa.isGrupo) return null  // pra grupo não mostramos checkmark detalhado no MVP
    const outro = conversa.participantes.find(p => p.id !== meuId)
    return outro?.lastReadAt ? new Date(outro.lastReadAt) : null
  }, [conversa, meuId])

  const typingNames = Array.from(typingUsers.values()).map(t => {
    if (t.nome) return t.nome
    // Resolve via participantes da conversa
    return ''
  }).filter(Boolean)

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
          const outro = conversa.participantes.find(p => p.id !== meuId)
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
              {conversa.isGrupo ? `${conversa.participantes.length} membros` : (
                conversa.participantes.find(p => p.id !== meuId)?.email ?? ''
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-muted/10">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">Comece a conversa…</div>
        ) : (
          mensagens.map((m, idx) => {
            const ehMinha = m.autorId === meuId
            const autorPart = !ehMinha ? conversa.participantes.find(p => p.id === m.autorId) : null
            const showAvatar = !ehMinha && (idx === 0 || mensagens[idx - 1]?.autorId !== m.autorId)
            const foiLida = ehMinha && lidoAteEm && new Date(m.createdAt) <= lidoAteEm
            return (
              <div key={m.id} className={cn('flex gap-2', ehMinha ? 'justify-end' : 'justify-start')}>
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
                    'rounded-2xl px-3 py-1.5 text-sm leading-snug break-words',
                    ehMinha ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
                  )}>
                    {m.conteudo}
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
                  </div>
                  <div className={cn('text-[10px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1', ehMinha && 'flex-row-reverse')}>
                    {timeHm(m.createdAt)}
                    {ehMinha && (foiLida
                      ? <CheckCheck className="h-3 w-3 text-sky-500" />
                      : <Check className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
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
      <div className="px-3 py-2.5 border-t border-border bg-card flex items-end gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="h-8 w-8 rounded hover:bg-muted flex items-center justify-center text-muted-foreground" title="Anexar">
          <ImagePlus className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,application/*" multiple onChange={handleFilePick} className="hidden" />
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={onKey}
          rows={1}
          placeholder="Mensagem… (Shift+Enter pra quebrar linha)"
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
// NovoGrupoView — modal in-painel pra criar grupo
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
