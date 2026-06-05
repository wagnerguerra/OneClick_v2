'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  MessageSquare, X, Send, Loader2, ArrowLeft, Search, Users, Paperclip,
  ImagePlus, Check, CheckCheck, Edit2, Trash2, Smile, AtSign,
  ChevronDown, MoreVertical, MonitorDown, Settings as SettingsIcon,
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

// ============================================================
// Helpers
// ============================================================

const STATUS_LABEL: Record<NonNullable<ChatStatus> | 'offline', string> = {
  online: 'Online',
  ausente: 'Ausente',
  dnd: 'Não perturbar',
  invisible: 'Invisível (parece offline)',
  offline: 'Offline',
}

const STATUS_COR: Record<'online' | 'ausente' | 'dnd' | 'offline', string> = {
  online:  'bg-emerald-500',
  ausente: 'bg-amber-500',
  dnd:     'bg-rose-500',
  offline: 'bg-muted-foreground/40',
}

/**
 * Resolve a presença visual a partir do chatStatus + lastActivityAt.
 * `ausenteAposMin` vem da ChatConfig (master configura em /configuracoes/chat).
 * Depois desse tempo + dobro, vira offline.
 */
function presencaEfetiva(
  u: { chatStatus?: ChatStatus; lastActivityAt?: Date | string | null },
  ausenteAposMin = 5,
): 'online' | 'ausente' | 'dnd' | 'offline' {
  if (u.chatStatus === 'invisible') return 'offline'
  if (u.chatStatus === 'online' || u.chatStatus === 'ausente' || u.chatStatus === 'dnd') return u.chatStatus
  if (!u.lastActivityAt) return 'offline'
  const diffMin = (Date.now() - new Date(u.lastActivityAt).getTime()) / 60_000
  if (diffMin < ausenteAposMin) return 'online'
  if (diffMin < ausenteAposMin * 3) return 'ausente'
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

/** Converte "<@id>" para "@Nome" em texto puro (sem JSX) — usado em previews de lista. */
function mencoesParaTexto(texto: string, participantes: Participante[]): string {
  return texto.replace(/<@([a-z0-9]+)>/gi, (_, id) => {
    const p = participantes.find(x => x.id === id)
    return `@${p?.name ?? 'usuário'}`
  })
}

/**
 * Detecta se a mensagem é composta SÓ por emojis (sem texto comum).
 * Usa Intl.Segmenter pra dividir corretamente sequências ZWJ (👨‍👩‍👧, 🏳️‍🌈)
 * e modifiers de skin-tone como 1 emoji cada. Retorna count em grafemas.
 */
function analisarSoEmoji(texto: string): { soEmoji: boolean; count: number } {
  const limpo = texto.replace(/\s+/g, '')
  if (!limpo) return { soEmoji: false, count: 0 }
  // Fallback se o ambiente não tiver Intl.Segmenter (Safari < 14.1)
  if (typeof Intl === 'undefined' || !Intl.Segmenter) {
    const soEmoji = /^[\p{Extended_Pictographic}‍️︎\p{Emoji_Modifier}]+$/u.test(limpo)
    return { soEmoji, count: soEmoji ? Array.from(limpo).length : 0 }
  }
  const seg = new Intl.Segmenter('pt', { granularity: 'grapheme' })
  const graphemes = Array.from(seg.segment(limpo), s => s.segment)
  for (const g of graphemes) {
    if (!/\p{Extended_Pictographic}/u.test(g)) return { soEmoji: false, count: 0 }
  }
  return { soEmoji: true, count: graphemes.length }
}

const EMOJI_QUICK = ['👍', '❤️', '😂', '😮', '😢', '👏']

/** Catálogo de emojis pra inserir no texto da mensagem (não confundir com EMOJI_QUICK das reactions). */
const EMOJI_PICKER: Array<{ name: string; emojis: string[] }> = [
  { name: 'Sorrisos', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠'] },
  { name: 'Pessoas', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','🩸'] },
  { name: 'Corações', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️'] },
  { name: 'Animais', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈'] },
  { name: 'Comida', emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🫔','🥙','🧆','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'] },
  { name: 'Objetos', emojis: ['📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📀','🎥','📷','📸','📹','📞','☎️','📟','📠','📺','📻','⏰','⏱️','⏲️','🕰️','📡','🔋','🔌','💡','🔦','🕯️','🪔','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','📦','📫','📬','📭','📪','📮','📥','📤','📨','📧','💌','📜','📃','📄','📑','📊','📈','📉','📋','📌','📍','📎','🖇️','📐','📏','✂️','🗒️','🗓️','📆','📅','🗑️','📇','📁','📂','📒','📓','📔','📕','📖','📗','📘','📙','📚','📰','🔑','🗝️','🔒','🔓'] },
  { name: 'Símbolos', emojis: ['✅','❌','⛔','🚫','⚠️','❗','❓','❕','❔','💯','✔️','✖️','➕','➖','➗','💲','💱','♾️','🔔','🔕','🚀','🔥','✨','⭐','🌟','💫','💥','💢','💨','💦','💤','🌈','☀️','🌤️','⛅','☁️','🌧️','⛈️','🌩️','❄️','☃️','🌪️','💧','🌊','🆗','🆕','🆒','🆓','🔝','🆙','🔄','🔃','🔂','🔁','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','🔼','🔽','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️','↕️','↔️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤'] },
]

/**
 * Wallpaper estilo WhatsApp — doodles sutis (balões, smileys, hearts, checks)
 * em SVG inline. Opacidade baixa pra não competir com o conteúdo; cor neutra
 * que funciona em light e dark mode (currentColor herdaria, mas SVG inline
 * usa fill literal — uso cinza-500 com opacidade que serve nos dois temas).
 */
const CHAT_BG_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
<g fill='#64748b' fill-opacity='0.07'>
<path d='M30 28c-5 0-9 4-9 9v12c0 5 4 9 9 9h6l4 5 4-5h6c5 0 9-4 9-9V37c0-5-4-9-9-9H30zm0 2h26c4 0 7 3 7 7v12c0 4-3 7-7 7H49l-3 4-3-4H30c-4 0-7-3-7-7V37c0-4 3-7 7-7z'/>
<circle cx='160' cy='40' r='10'/>
<circle cx='157' cy='37' r='1.3' fill='#fff' fill-opacity='1'/>
<circle cx='163' cy='37' r='1.3' fill='#fff' fill-opacity='1'/>
<path d='M155 42c1 2 3 3 5 3s4-1 5-3' stroke='#fff' stroke-opacity='1' stroke-width='1.2' fill='none' stroke-linecap='round'/>
<path d='M105 110c-3-3-9-3-12 0s-3 8 0 11l12 12 12-12c3-3 3-8 0-11s-9-3-12 0z'/>
<path d='M55 150l4 4 8-10' stroke='#64748b' stroke-opacity='0.18' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
<path d='M62 150l4 4 8-10' stroke='#64748b' stroke-opacity='0.18' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
<path d='M170 130l18 6-18 6 4-6z'/>
<path d='M40 100c-3 0-5 2-5 5v6c0 3 2 5 5 5h3l2 3 2-3h3c3 0 5-2 5-5v-6c0-3-2-5-5-5H40z'/>
<text x='130' y='180' font-family='system-ui' font-size='14' font-weight='600'>@</text>
</g>
</svg>`
const CHAT_BG_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(CHAT_BG_SVG)}")`

/** Gera um gradiente colorido determinístico a partir do nome (pra fallback de avatar). */
const AVATAR_GRADIENTS = [
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-fuchsia-500',
  'from-rose-500 to-orange-500',
  'from-amber-500 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-lime-500 to-emerald-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-purple-500',
  'from-orange-500 to-red-500',
]
function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!
}

// ============================================================
// Componente principal
// ============================================================

interface ChatHeaderButtonProps {
  /**
   * Modo embed: renderiza o conteúdo do chat em fullscreen, sem o botão
   * trigger no header e sem o Sheet wrapper. Usado pela rota /chat-desktop
   * (aplicativo desktop Electron) — mesma UX do dropdown do header, mas
   * sempre aberto e ocupando 100% da janela.
   */
  embed?: boolean
}

export function ChatHeaderButton({ embed = false }: ChatHeaderButtonProps = {}) {
  const { profile } = useCurrentUserProfile()
  const meuId = profile?.id ?? null

  // No modo embed, o chat sempre fica aberto — não há trigger nem close.
  const [open, setOpen] = useState(embed)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null)
  const [novoGrupoOpen, setNovoGrupoOpen] = useState(false)
  const [searchPessoas, setSearchPessoas] = useState('')
  const [searchConversas, setSearchConversas] = useState('')
  // Meu status manual (null = auto)
  const [meuStatus, setMeuStatus] = useState<ChatStatus>(null)
  // Tempo (em minutos) para ficar ausente — vem da ChatConfig. Default 5min até carregar.
  const [ausenteAposMin, setAusenteAposMin] = useState(5)

  const totalUnread = useMemo(() => conversas.reduce((sum, c) => sum + c.unreadCount, 0), [conversas])

  // Detecta se está rodando dentro do aplicativo desktop Electron (chatDesktop
  // exposto pelo preload). Inicia false no SSR e no primeiro render do client
  // pra evitar hydration mismatch — só vira true após o mount via useEffect.
  const [isRunningInDesktopApp, setIsRunningInDesktopApp] = useState(false)
  useEffect(() => {
    setIsRunningInDesktopApp(
      typeof window !== 'undefined'
      && (window as unknown as { chatDesktop?: { isDesktop?: boolean } }).chatDesktop?.isDesktop === true,
    )
  }, [])

  // Reset estado interno quando o sheet fecha. No modo embed o sheet nunca
  // fecha — apenas troca de conversa/volta pra lista interna.
  function handleOpenChange(next: boolean) {
    if (embed) return
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
    // CRÍTICO: dispara presence.ping AWAITADO antes do primeiro loadOnline.
    // O middleware touch() do tRPC é fire-and-forget — se a query getOnline()
    // roda em paralelo, ela é executada antes do UPDATE de lastActivityAt
    // commitar e o user aparece "offline" no próprio dropdown logo após login.
    // Esperar a mutation resolver garante consistência na primeira carga.
    ;(async () => {
      try { await (trpc.presence as any).ping.mutate() } catch { /* ignora */ }
      loadConversas()
      loadOnline()
    })()
    // ChatConfig: tempo de ausência (lido 1x no mount; mudanças do master
    // refletem em F5 — sem SSE pra config porque é raro).
    ;(trpc.chat as any).configGet.query()
      .then((cfg: { ausenteAposMin: number }) => setAusenteAposMin(cfg.ausenteAposMin))
      .catch(() => {})
    const i = setInterval(loadOnline, 30_000)
    return () => clearInterval(i)
  }, [loadConversas, loadOnline])

  // ========== Beforeunload + visibilitychange → marca offline ==========
  // Usa sendBeacon pra garantir que o request saia mesmo com a aba sendo
  // destruída. Fetch comum é cancelado em beforeunload.
  useEffect(() => {
    if (!meuId) return
    function markOffline() {
      try {
        const url = `${getApiUrl()}/api/chat/offline`
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          navigator.sendBeacon(url, new Blob([], { type: 'application/json' }))
        } else {
          // Fallback: fetch keepalive (Safari < 14 não tem sendBeacon)
          fetch(url, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {})
        }
      } catch { /* ignora */ }
    }
    window.addEventListener('beforeunload', markOffline)
    window.addEventListener('pagehide', markOffline)
    return () => {
      window.removeEventListener('beforeunload', markOffline)
      window.removeEventListener('pagehide', markOffline)
    }
  }, [meuId])

  // ========== Listener pra abrir o chat numa conversa específica (do toast) ==========
  useEffect(() => {
    function onOpenConversa(e: Event) {
      const detail = (e as CustomEvent<{ conversaId: string }>).detail
      if (!detail?.conversaId) return
      setOpen(true)
      // Aguarda load das conversas pra achar a conversa correta
      const tentarSelecionar = () => {
        const c = conversas.find(x => x.id === detail.conversaId)
        if (c) { setConversaAtiva(c); return true }
        return false
      }
      if (!tentarSelecionar()) {
        // Conversa ainda não carregada — carrega e tenta de novo
        loadConversas().then(() => {
          setTimeout(tentarSelecionar, 0)
        }).catch(() => {})
      }
    }
    window.addEventListener('chat:open-conversa', onOpenConversa)
    return () => window.removeEventListener('chat:open-conversa', onOpenConversa)
  }, [conversas, loadConversas])

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
              // Toast in-app — SEMPRE, exceto se for a própria mensagem ou se a conversa ativa estiver visível (painel aberto)
              if (ev.mensagem.autorId !== meuId && !(open && conversaAtiva && ev.conversaId === conversaAtiva.id)) {
                const conv = conversas.find(c => c.id === ev.conversaId)
                const autor = conv?.participantes.find(p => p.id === ev.mensagem.autorId)
                window.dispatchEvent(new CustomEvent('chat:toast-mensagem', {
                  detail: {
                    conversaId: ev.conversaId,
                    conversaNome: conv?.nome ?? 'Conversa',
                    conversaIsGrupo: !!conv?.isGrupo,
                    autorNome: autor?.name ?? 'Alguém',
                    autorImage: autor?.image ?? null,
                    mensagemConteudo: ev.mensagem.conteudo,
                    mensagemId: ev.mensagem.id,
                  },
                }))
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
    if (typeof window === 'undefined') return
    const conv = conversas.find(c => c.id === ev.conversaId)
    const autor = conv?.participantes.find(p => p.id === ev.mensagem.autorId)
    const titulo = conv?.isGrupo ? `${conv.nome} · ${autor?.name ?? 'Alguém'}` : (autor?.name ?? 'Nova mensagem')
    const corpo = ev.mensagem.conteudo.slice(0, 100)
    // Aplicativo desktop Electron: usa notificação nativa via IPC (melhor que
    // a do browser, integra com Action Center do Windows). Detectada via
    // window.chatDesktop (exposto pelo preload do app desktop).
    const desktop = (window as unknown as { chatDesktop?: { notify: (p: { titulo: string; corpo: string }) => void } }).chatDesktop
    if (desktop?.notify) {
      try { desktop.notify({ titulo, corpo }) } catch { /* ignora */ }
      return
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    try {
      const n = new Notification(titulo, {
        body: corpo,
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

  // Espelha a contagem de não lidas pro main process do Electron (tooltip do tray)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const desktop = (window as unknown as { chatDesktop?: { setUnread: (n: number) => void } }).chatDesktop
    if (desktop?.setUnread) {
      try { desktop.setUnread(totalUnread) } catch { /* ignora */ }
    }
  }, [totalUnread])

  // Espelha o status efetivo pro main process — usado pra desenhar a bolinha
  // de presença no ícone do tray (verde/âmbar/vermelho/cinza).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const desktop = (window as unknown as { chatDesktop?: { setStatus: (s: string) => void } }).chatDesktop
    if (desktop?.setStatus) {
      try { desktop.setStatus(minhaPresenca) } catch { /* ignora */ }
    }
  }, [minhaPresenca])

  // ========== Trocar status ==========
  async function trocarStatus(novo: ChatStatus) {
    setMeuStatus(novo)
    try {
      await (trpc.chat as any).setStatus.mutate({ status: novo })
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ========== Excluir (esconder) conversa ==========
  async function esconderConversa(c: Conversa) {
    const ok = await alerts.confirm({
      title: 'Excluir conversa?',
      text: 'A conversa some daqui pra você. Se chegar uma nova mensagem, ela volta automaticamente. Outros participantes continuam vendo o histórico.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.chat as any).hideConversa.mutate({ conversaId: c.id })
      if (conversaAtiva?.id === c.id) setConversaAtiva(null)
      await loadConversas()
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
    const q = searchPessoas.trim().toLowerCase()
    const all = onlineUsers
      .filter(u => u.id !== meuId)
      .map(u => ({ ...u, presenca: presencaEfetiva(u, ausenteAposMin) }))
    all.sort((a, b) => {
      const order = { online: 0, ausente: 1, dnd: 2, offline: 3 }
      if (order[a.presenca] !== order[b.presenca]) return order[a.presenca] - order[b.presenca]
      return a.name.localeCompare(b.name)
    })
    return q ? all.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all
  }, [onlineUsers, searchPessoas, meuId, ausenteAposMin])

  const conversasFiltradas = useMemo(() => {
    const q = searchConversas.trim().toLowerCase()
    return q ? conversas.filter(c => c.nome.toLowerCase().includes(q)) : conversas
  }, [conversas, searchConversas])

  const totalOnline = useMemo(() =>
    onlineUsers.filter(u => u.id !== meuId && presencaEfetiva(u, ausenteAposMin) === 'online').length,
  [onlineUsers, meuId, ausenteAposMin])

  // Minha presença efetiva (pra o dot no botão do header).
  // - Manual local (clicado no dropdown) tem prioridade absoluta — `invisible`
  //   aparece como offline pros outros, mas pra mim mesmo continua "online".
  // - Sem manual: deriva do snapshot do banco (eu.chatStatus + eu.lastActivityAt).
  // - Snapshot ainda não chegou (1ª render pós-login): assume "online" otimista —
  //   evita o flicker "Offline → Online" que acontecia porque o setMeuStatus
  //   só rodava DEPOIS do loadOnline retornar.
  const minhaPresenca: 'online' | 'ausente' | 'dnd' | 'offline' = useMemo(() => {
    // Override manual local
    if (meuStatus === 'invisible') return 'online' // pra mim, sigo "online" mesmo invisible
    if (meuStatus === 'online' || meuStatus === 'ausente' || meuStatus === 'dnd') return meuStatus
    // Derivado do banco
    const eu = onlineUsers.find(u => u.id === meuId)
    if (eu) return presencaEfetiva({ chatStatus: eu.chatStatus, lastActivityAt: eu.lastActivityAt }, ausenteAposMin)
    // Sem snapshot ainda — provavelmente acabou de logar e a request tá em voo
    return 'online'
  }, [onlineUsers, meuId, meuStatus, ausenteAposMin])

  // ============================================================
  // Render
  // ============================================================

  // ─── Conteúdo do painel (compartilhado entre Sheet e modo embed) ───
  // No modo embed (sem Sheet wrapper), <SheetTitle> não pode ser usado porque
  // o Radix exige Dialog.Root acima — daí o "DialogTitle must be used within
  // Dialog". Usamos h1 sr-only que cumpre o mesmo papel pra acessibilidade.
  const panelContent = (
    <>
      {embed
        ? <h1 className="sr-only">Chat interno</h1>
        : <SheetTitle className="sr-only">Chat interno</SheetTitle>}
      {novoGrupoOpen ? (
            <NovoGrupoView
              meuId={meuId}
              onlineUsers={onlineUsers}
              onCancel={() => setNovoGrupoOpen(false)}
              onCreated={(c) => { setNovoGrupoOpen(false); loadConversas(); setConversaAtiva(c) }}
            />
          ) : (
            <div className="flex flex-col h-full">
              {/* Header global */}
              <div className="shrink-0 border-b border-border/60 bg-gradient-to-r from-muted/40 to-muted/10 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-sm">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight tracking-tight">Chat interno</div>
                    <div className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1 mt-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {totalOnline} {totalOnline === 1 ? 'pessoa online' : 'pessoas online'}
                    </div>
                  </div>
                </div>
                <div className="pr-12 flex items-center gap-2">
                  {/* Link pra baixar o app desktop — escondido quando ja
                      esta rodando dentro do proprio app (window.chatDesktop) */}
                  {!isRunningInDesktopApp && (
                    <a
                      href="/chat-desktop-download"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Baixar OneClick Chat Desktop"
                      className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <MonitorDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">App desktop</span>
                    </a>
                  )}
                  {/* Configurações do chat — abre /chat-desktop/settings */}
                  <a
                    href="/chat-desktop/settings"
                    target={embed ? undefined : '_blank'}
                    rel={embed ? undefined : 'noopener noreferrer'}
                    title="Configurações do chat"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </a>
                  <StatusDropdown statusManual={meuStatus} presencaAtual={minhaPresenca} onChange={trocarStatus} />
                </div>
              </div>

              {/* 3 colunas */}
              <div className="flex-1 flex min-h-0">
                {/* Coluna 1: Pessoas */}
                <div className="w-[220px] shrink-0 border-r border-border/60 flex flex-col bg-muted/20">
                  <div className="shrink-0 px-3 py-2 border-b border-border/60 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pessoas</span>
                    <button
                      type="button"
                      onClick={() => setNovoGrupoOpen(true)}
                      className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      title="Criar novo grupo"
                    >
                      <Users className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-2 py-1.5 border-b border-border/60">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      <Input
                        value={searchPessoas}
                        onChange={e => setSearchPessoas(e.target.value)}
                        placeholder="Buscar…"
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <PessoasList pessoas={pessoasFiltradas} onClickPessoa={abrirDM} />
                  </div>
                </div>

                {/* Coluna 2: Conversas */}
                <div className="w-[290px] shrink-0 border-r border-border/60 flex flex-col bg-muted/10">
                  <div className="shrink-0 px-3 py-2 border-b border-border/60 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Conversas</span>
                    {totalUnread > 0 && (
                      <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5 border-b border-border/60">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      <Input
                        value={searchConversas}
                        onChange={e => setSearchConversas(e.target.value)}
                        placeholder="Buscar conversa…"
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <ConversasList
                      conversas={conversasFiltradas}
                      meuId={meuId}
                      conversaAtivaId={conversaAtiva?.id ?? null}
                      onClickConversa={setConversaAtiva}
                      onHideConversa={esconderConversa}
                    />
                  </div>
                </div>

                {/* Coluna 3: Chat ou Empty */}
                <div className="flex-1 min-w-0 flex flex-col bg-card">
                  {conversaAtiva ? (
                    <ChatView
                      key={conversaAtiva.id}
                      conversa={conversaAtiva}
                      meuId={meuId}
                      onMessageSent={loadConversas}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-gradient-to-br from-muted/10 via-card to-muted/5">
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-violet-500/20 flex items-center justify-center mb-4 shadow-inner ring-1 ring-sky-500/10">
                        <MessageSquare className="h-9 w-9 text-sky-500" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-1.5">Selecione uma conversa</h3>
                      <p className="text-[12px] text-muted-foreground max-w-[280px] leading-relaxed">
                        Escolha uma <strong className="text-foreground/80">pessoa</strong> na coluna da esquerda pra iniciar uma DM, ou clique em uma <strong className="text-foreground/80">conversa</strong> existente.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
      )}
    </>
  )

  // ─── Modo embed: chat fullscreen, sem trigger nem Sheet (usado pelo desktop) ───
  if (embed) {
    return (
      <div className="fixed inset-0 z-0 flex flex-col bg-card">
        {panelContent}
      </div>
    )
  }

  // ─── Modo normal: trigger no header + Sheet lateral ───
  return (
    <>
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
        <span
          className={cn(
            'absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-card transition-colors',
            STATUS_COR[minhaPresenca],
          )}
          title={`Status: ${STATUS_LABEL[minhaPresenca]}`}
        />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-1 border-2 border-card">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" size="xl" className="w-[80vw] max-w-[1200px] p-0 flex flex-col">
          {panelContent}
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
  // Quando o user não escolheu manualmente, mostra a presença derivada (sem
  // sufixo "(auto)"). Clicar na opção já marcada limpa o override (volta ao
  // modo derivado). Não há opção "Automático" no dropdown.
  const labelAtual = statusManual ? STATUS_LABEL[statusManual] : STATUS_LABEL[presencaAtual]
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
          { v: 'online',    label: 'Online',               cor: 'bg-emerald-500' },
          { v: 'ausente',   label: 'Ausente',              cor: 'bg-amber-500' },
          { v: 'dnd',       label: 'Não perturbar',        cor: 'bg-rose-500' },
          { v: 'invisible', label: 'Invisível',            cor: 'bg-muted-foreground/40' },
        ] as const).map(opt => (
          <DropdownMenuItem
            key={String(opt.v)}
            // Clicar na opção já selecionada limpa o override → null (volta ao auto)
            onClick={() => onChange(statusManual === opt.v ? null : (opt.v as ChatStatus))}
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

function Avatar({ user, presenca, size = 'md' }: {
  user: { name: string; image: string | null }
  presenca?: 'online' | 'ausente' | 'dnd' | 'offline'
  size?: 'sm' | 'md' | 'lg'
}) {
  const sz = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const txt = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-[11px]'
  const dotSz = size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5'
  return (
    <div className={cn('relative shrink-0', sz)}>
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveAssetUrl(user.image)} alt={user.name} className={cn('rounded-full object-cover', sz)} />
      ) : (
        <div className={cn(
          'rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-white shadow-sm',
          sz, txt, avatarGradient(user.name || '?'),
        )}>
          {initials(user.name)}
        </div>
      )}
      {presenca && (
        <span className={cn(
          'absolute bottom-0 right-0 rounded-full ring-2 ring-card',
          dotSz, STATUS_COR[presenca],
        )} />
      )}
    </div>
  )
}

function PessoasList({ pessoas, onClickPessoa }: {
  pessoas: Array<OnlineUser & { presenca: 'online' | 'ausente' | 'dnd' | 'offline' }>
  onClickPessoa: (id: string) => void
}) {
  if (pessoas.length === 0) {
    return <div className="p-6 text-center text-[11px] text-muted-foreground">Ninguém por aqui.</div>
  }
  return (
    <ul className="py-1 px-1">
      {pessoas.map(u => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => onClickPessoa(u.id)}
            className="w-full px-2.5 py-1.5 flex items-center gap-2.5 hover:bg-muted/60 rounded-md transition-colors text-left"
            title={`${u.name} · ${STATUS_LABEL[u.presenca]}`}
          >
            <Avatar user={u} presenca={u.presenca} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate leading-tight">{u.name}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">
                {STATUS_LABEL[u.presenca]}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ConversasList({ conversas, meuId, conversaAtivaId, onClickConversa, onHideConversa }: {
  conversas: Conversa[]
  meuId: string | null
  conversaAtivaId: string | null
  onClickConversa: (c: Conversa) => void
  onHideConversa: (c: Conversa) => void
}) {
  if (conversas.length === 0) {
    return <div className="p-6 text-center text-[11px] text-muted-foreground">Sem conversas ainda.<br/>Comece pela coluna <strong>Pessoas</strong>.</div>
  }
  return (
    <ul className="py-1 px-1">
      {conversas.map(c => {
        const outro = !c.isGrupo ? c.participantes.find(p => p.id !== meuId) : null
        const rawPreview = c.ultimaMensagem?.conteudo ?? ''
        const preview = !rawPreview
          ? '—'
          : rawPreview === '(anexo)'
            ? '📎 Arquivo'
            : mencoesParaTexto(rawPreview, c.participantes)
        const ativa = c.id === conversaAtivaId
        return (
          <li key={c.id} className="my-0.5 group/conv relative">
            <button
              type="button"
              onClick={() => onClickConversa(c)}
              className={cn(
                'w-full px-2.5 py-2 flex items-start gap-2.5 rounded-md transition-colors text-left relative',
                ativa ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/30' : 'hover:bg-muted/60',
              )}
            >
              {ativa && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-sky-500" />}
              {c.isGrupo ? (
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-sm">
                  <Users className="h-4 w-4" />
                </div>
              ) : outro ? (
                <Avatar user={outro} />
              ) : null}
              <div className="flex-1 min-w-0 pr-5">
                <div className="flex items-center justify-between gap-2">
                  <div className={cn('text-[13px] truncate', c.unreadCount > 0 ? 'font-bold' : 'font-semibold')}>{c.nome}</div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeRelative(c.ultimaMensagemEm)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className={cn('text-[11px] truncate', c.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                    {preview}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full bg-sky-500 text-white text-[10px] font-bold shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
            {/* Menu de ações (hover) — fica fora do <button> pra não conflitar com o onClick */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={e => e.stopPropagation()}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded hover:bg-muted flex items-center justify-center opacity-0 group-hover/conv:opacity-100 transition-opacity"
                  title="Mais opções"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={e => { e.stopPropagation(); onHideConversa(c) }}
                  className="text-xs gap-2 cursor-pointer text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir conversa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// ChatView — abre uma conversa específica (com edit/delete/reactions/mentions/infinite scroll)
// ============================================================

function ChatView({ conversa, meuId, onMessageSent }: {
  conversa: Conversa
  meuId: string | null
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
  const [emojiInputOpen, setEmojiInputOpen] = useState(false)
  const [mentionState, setMentionState] = useState<{ open: boolean; query: string; start: number } | null>(null)
  // Mapeia "@Nome" (visível no input) → userId (usado no <@id> ao enviar)
  const [mentionsRefs, setMentionsRefs] = useState<Array<{ name: string; id: string }>>([])
  const emojiPopupRef = useRef<HTMLDivElement>(null)

  // Fecha popup de emojis ao clicar fora
  useEffect(() => {
    if (!emojiInputOpen) return
    function handle(e: MouseEvent) {
      if (emojiPopupRef.current && !emojiPopupRef.current.contains(e.target as Node)) setEmojiInputOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [emojiInputOpen])

  // Insere emoji na posição do cursor (ou no fim se o textarea não tiver foco)
  function insertEmoji(emoji: string) {
    const t = textareaRef.current
    if (!t) {
      setTexto(prev => prev + emoji)
      return
    }
    const start = t.selectionStart ?? texto.length
    const end = t.selectionEnd ?? texto.length
    const novoTexto = texto.slice(0, start) + emoji + texto.slice(end)
    setTexto(novoTexto)
    requestAnimationFrame(() => {
      t.focus()
      const pos = start + emoji.length
      t.setSelectionRange(pos, pos)
    })
  }

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
    function onAnexoAdicionado(e: Event) {
      const ev = (e as CustomEvent).detail as { conversaId: string; mensagemId: string; anexo: Mensagem['anexos'][number] }
      if (ev.conversaId !== conversa.id) return
      setMensagens(prev => prev.map(m => m.id === ev.mensagemId
        ? { ...m, anexos: m.anexos.some(a => a.id === ev.anexo.id) ? m.anexos : [...m.anexos, ev.anexo] }
        : m,
      ))
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
    window.addEventListener('chat:anexo-adicionado', onAnexoAdicionado)
    window.addEventListener('chat:lido', onLido)
    window.addEventListener('chat:typing', onTyping)
    return () => {
      window.removeEventListener('chat:mensagem-nova', onNova)
      window.removeEventListener('chat:mensagem-editada', onEditada)
      window.removeEventListener('chat:mensagem-deletada', onDeletada)
      window.removeEventListener('chat:reaction-mudou', onReaction)
      window.removeEventListener('chat:anexo-adicionado', onAnexoAdicionado)
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
    const items = Array.from(e.clipboardData?.items ?? [])
    // Quando o user copia texto formatado de Word/Outlook/PowerPoint, o
    // clipboard às vezes traz uma imagem rasterizada JUNTO com o texto.
    // Se há texto puro com conteúdo, prioriza a colagem de texto e NÃO
    // dispara upload da imagem (era esse o bug #HLP0060: texto colado
    // virava "arquivo" no chat porque o handler só olhava a imagem).
    const hasPlainText = items.some(it => it.kind === 'string' && (it.type === 'text/plain' || it.type === 'text/html'))
    if (hasPlainText) return // deixa o browser colar o texto normalmente

    for (const item of items) {
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
    // Insere "@Nome " visível no input (bonito); a conversão para <@id> acontece no enviar()
    const novoTexto = `${before}@${p.name}${after} `
    setTexto(novoTexto)
    setMentionsRefs(prev => prev.some(m => m.id === p.id) ? prev : [...prev, { name: p.name, id: p.id }])
    setMentionState(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // ========== Enviar ==========
  async function enviar() {
    const textoCru = texto.trim()
    if (!textoCru && anexosPendentes.length === 0) return
    if (anexosPendentes.some(a => a.uploading)) {
      alerts.error('Aguarde', 'Anexos ainda enviando…')
      return
    }
    // Converte cada "@Nome" do input em "<@id>" (formato persistido no backend).
    // Ordena por nome desc pra que "Wagner Guerra" seja resolvido antes de "Wagner".
    let conteudo = textoCru
    const refsOrdenadas = [...mentionsRefs].sort((a, b) => b.name.length - a.name.length)
    for (const ref of refsOrdenadas) {
      const esc = ref.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      conteudo = conteudo.replace(new RegExp(`@${esc}(?=\\s|$|[^\\w])`, 'g'), `<@${ref.id}>`)
    }

    setEnviando(true)
    try {
      const msgConteudo = conteudo || '(anexo)'
      const msg = await (trpc.chat as any).enviar.mutate({ conversaId: conversa.id, conteudo: msgConteudo }) as Mensagem
      // Envia cada anexo e captura o retorno (objeto real do banco) pra exibir no estado local
      const anexosCriados: Mensagem['anexos'] = []
      for (const a of anexosPendentes) {
        if (!a.fileUrl) continue
        try {
          const criado = await (trpc.chat as any).addAnexo.mutate({
            mensagemId: msg.id, fileName: a.fileName, fileUrl: a.fileUrl, mimeType: a.mimeType, tamanho: a.tamanho,
          }) as { id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }
          anexosCriados.push(criado)
        } catch { /* anexo falhou, mas mensagem já foi */ }
      }
      setMensagens(prev => [...prev, { ...msg, anexos: anexosCriados, reactions: [] }])
      setTexto('')
      setAnexosPendentes([])
      setMentionState(null)
      setMentionsRefs([])
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
    const ok = await alerts.confirm({
      title: 'Excluir mensagem?',
      text: 'A mensagem será substituída por "Mensagem excluída" para todos os participantes.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
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
      {/* Header da conversa */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3 bg-gradient-to-r from-muted/30 to-transparent">
        {conversa.isGrupo ? (
          <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-md">
            <Users className="h-5 w-5" />
          </div>
        ) : (() => {
          const outro = participantes.find(p => p.id !== meuId)
          if (!outro) return null
          return <Avatar user={outro} size="lg" />
        })()}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold truncate leading-tight">{conversa.nome}</div>
          {typingNames.length > 0 ? (
            <div className="text-[11px] text-sky-600 dark:text-sky-400 italic flex items-center gap-1 mt-0.5">
              <span className="flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '240ms' }} />
              </span>
              {typingNames.length === 1 ? `${typingNames[0]} está digitando…` : `${typingNames.length} pessoas digitando…`}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {conversa.isGrupo
                ? `${participantes.length} membros`
                : (participantes.find(p => p.id !== meuId)?.email ?? '')}
            </div>
          )}
        </div>
      </div>

      {/* Mensagens — wallpaper estilo WhatsApp */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2 relative bg-muted/20"
        style={{ backgroundImage: CHAT_BG_URL, backgroundRepeat: 'repeat', backgroundSize: '200px 200px' }}
      >
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
                  {/* Quando a mensagem é só anexo (conteudo === "(anexo)"), escondemos
                      o texto placeholder e removemos o fundo da bolha — a imagem/arquivo
                      vira a própria "bolha" sem moldura.
                      Quando é só emojis (≤6), também tiramos a bolha e aumentamos o
                      tamanho dos emojis (padrão WhatsApp: 1→jumbo, 2-3→grande, 4-6→médio). */}
                  {(() => {
                    const apenasAnexo = m.conteudo === '(anexo)' && m.anexos.length > 0
                    const emojiInfo = analisarSoEmoji(m.conteudo)
                    const emojiJumbo = emojiInfo.soEmoji && emojiInfo.count >= 1 && emojiInfo.count <= 6 && !apenasAnexo
                    const semBolha = apenasAnexo || emojiJumbo
                    const emojiSizeClass = emojiJumbo
                      ? emojiInfo.count === 1
                        ? 'text-[60px] leading-none py-1'
                        : emojiInfo.count <= 3
                          ? 'text-[40px] leading-none py-1'
                          : 'text-[28px] leading-none py-1'
                      : ''
                    return (
                      <div className={cn(
                        'leading-snug break-words relative',
                        emojiJumbo ? emojiSizeClass : 'text-sm',
                        semBolha
                          ? 'rounded-2xl overflow-hidden'
                          : cn(
                              'rounded-2xl px-3 py-1.5',
                              ehMinha ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
                            ),
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
                          <span className="inline-flex items-center gap-1">
                            <Trash2 className="h-3 w-3" />
                            Mensagem excluída
                          </span>
                        ) : (
                          <>
                            {!apenasAnexo && renderConteudo(m.conteudo)}
                            {m.editedAt && !apenasAnexo && <span className="text-[9px] opacity-50 ml-1">(editado)</span>}
                            {m.anexos.length > 0 && (
                              <div className={cn(!apenasAnexo && 'mt-1.5', 'space-y-1')}>
                                {m.anexos.map(a => (
                                  a.mimeType?.startsWith('image/') ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={a.id} src={resolveAssetUrl(a.fileUrl)} alt={a.fileName} className={cn('rounded-md block', apenasAnexo ? 'max-h-64 max-w-full' : 'max-h-48')} />
                                  ) : (
                                    <a key={a.id} href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer"
                                      className={cn(
                                        'flex items-center gap-1.5 text-xs underline truncate',
                                        apenasAnexo
                                          ? 'px-3 py-1.5 rounded-2xl ' + (ehMinha ? 'bg-sky-500 text-white' : 'bg-muted text-foreground')
                                          : (ehMinha ? 'text-white/90' : 'text-sky-600'),
                                      )}>
                                      <Paperclip className="h-3 w-3" />{a.fileName}
                                    </a>
                                  )
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })()}

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

        {/* Picker de emojis pro input — popup acima do botão */}
        <div className="relative">
          <button type="button" onClick={() => setEmojiInputOpen(o => !o)}
            className={cn('h-8 w-8 rounded hover:bg-muted flex items-center justify-center transition-colors',
              emojiInputOpen ? 'text-sky-500 bg-muted' : 'text-muted-foreground')}
            title="Emoji">
            <Smile className="h-4 w-4" />
          </button>
          {emojiInputOpen && (
            <div ref={emojiPopupRef}
              className="absolute bottom-full left-0 mb-2 z-30 w-[340px] max-h-[300px] overflow-y-auto bg-card border border-border rounded-lg shadow-xl p-2">
              {EMOJI_PICKER.map(cat => (
                <div key={cat.name} className="mb-2 last:mb-0">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1 sticky top-0 bg-card py-0.5">{cat.name}</div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {cat.emojis.map(e => (
                      <button key={e} type="button" onClick={() => insertEmoji(e)}
                        className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-[18px] leading-none transition-colors"
                        title={e}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
