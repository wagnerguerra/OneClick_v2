'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare, X, Users } from 'lucide-react'
import { cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

interface ToastPayload {
  conversaId: string
  conversaNome: string
  conversaIsGrupo: boolean
  autorNome: string
  autorImage: string | null
  mensagemConteudo: string
  mensagemId: string
}

interface Toast extends ToastPayload {
  id: string
  state: 'in' | 'out'
}

const AUTO_DISMISS_MS = 6000
const MAX_VISIBLE = 5

/**
 * Renderiza notificações toast no canto inferior direito quando chegam mensagens
 * novas no chat interno — estilo Windows 11 (slide-in/out + fade). Escuta o
 * evento global `chat:toast-mensagem` disparado pelo ChatHeaderButton.
 *
 * Auto-dismiss em 6s; hover pausa o timer; click abre a conversa correspondente
 * via outro evento global `chat:open-conversa`.
 */
export function ChatToastListener() {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Map de timers por toast id pra pausar/retomar no hover
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Remove toast com animação de saída
  function dismiss(id: string) {
    setToasts(arr => arr.map(t => t.id === id ? { ...t, state: 'out' } : t))
    // Espera animação terminar antes de remover do array
    setTimeout(() => {
      setToasts(arr => arr.filter(t => t.id !== id))
      const tm = timersRef.current.get(id)
      if (tm) { clearTimeout(tm); timersRef.current.delete(id) }
    }, 250)
  }

  function scheduleDismiss(id: string, ms = AUTO_DISMISS_MS) {
    const t = timersRef.current.get(id)
    if (t) clearTimeout(t)
    const tm = setTimeout(() => dismiss(id), ms)
    timersRef.current.set(id, tm)
  }

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail
      if (!detail) return
      const id = `${detail.mensagemId}-${Date.now()}`
      setToasts(arr => {
        // Limita visíveis — descarta o mais antigo se exceder
        const next = [...arr, { ...detail, id, state: 'in' as const }]
        if (next.length > MAX_VISIBLE) next.shift()
        return next
      })
      scheduleDismiss(id)
    }
    window.addEventListener('chat:toast-mensagem', onToast)
    return () => {
      window.removeEventListener('chat:toast-mensagem', onToast)
      for (const t of timersRef.current.values()) clearTimeout(t)
      timersRef.current.clear()
    }
  }, [])

  function handleClick(t: Toast) {
    window.dispatchEvent(new CustomEvent('chat:open-conversa', { detail: { conversaId: t.conversaId } }))
    dismiss(t.id)
  }

  function handleMouseEnter(id: string) {
    const tm = timersRef.current.get(id)
    if (tm) { clearTimeout(tm); timersRef.current.delete(id) }
  }
  function handleMouseLeave(id: string) {
    scheduleDismiss(id, 2500)  // depois de hover, dá apenas 2.5s pra sair
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] pointer-events-none flex flex-col gap-2 items-end">
      {toasts.map(t => {
        // Strip HTML do conteúdo pra preview limpo
        const preview = t.mensagemConteudo.replace(/<@[a-z0-9]+>/gi, '@usuário').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        const initials = (t.autorNome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
        const titulo = t.conversaIsGrupo
          ? `${t.conversaNome} · ${t.autorNome}`
          : t.autorNome
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => handleClick(t)}
            onKeyDown={e => { if (e.key === 'Enter') handleClick(t) }}
            onMouseEnter={() => handleMouseEnter(t.id)}
            onMouseLeave={() => handleMouseLeave(t.id)}
            className={cn(
              'pointer-events-auto cursor-pointer w-[360px] max-w-[calc(100vw-2rem)]',
              'rounded-lg border border-border bg-card shadow-2xl shadow-black/20',
              'flex items-start gap-3 px-3.5 py-3',
              'hover:bg-muted/30 transition-colors',
              t.state === 'in' ? 'chat-toast-in' : 'chat-toast-out',
            )}
          >
            {/* Avatar do autor */}
            {t.autorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveAssetUrl(t.autorImage)}
                alt={t.autorNome}
                className="h-9 w-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wider">Nova mensagem</span>
              </div>
              <div className="text-[13px] font-semibold leading-tight mt-0.5 truncate flex items-center gap-1">
                {t.conversaIsGrupo && <Users className="h-3 w-3 text-violet-500 shrink-0" />}
                {titulo}
              </div>
              <div className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                {preview || '(anexo)'}
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismiss(t.id) }}
              className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Fechar"
              aria-label="Fechar notificação"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}

      {/* CSS pra animação estilo Windows — slide-in da direita + fade */}
      <style jsx global>{`
        @keyframes chatToastIn {
          0%   { transform: translateX(110%); opacity: 0; }
          70%  { transform: translateX(-4%); opacity: 1; }
          100% { transform: translateX(0);    opacity: 1; }
        }
        @keyframes chatToastOut {
          0%   { transform: translateX(0);    opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        .chat-toast-in  { animation: chatToastIn  0.34s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .chat-toast-out { animation: chatToastOut 0.22s ease-in forwards; }
      `}</style>
    </div>
  )
}
