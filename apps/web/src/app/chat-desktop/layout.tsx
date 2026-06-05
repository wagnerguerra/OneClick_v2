'use client'

/**
 * Layout da rota /chat-desktop — usado pelo aplicativo desktop Electron.
 * Sem sidebar, header, tabbar, page transitions — fullscreen puro com
 * dark mode forçado (a janela do Electron é compact e dark-only).
 *
 * Auth guard: se não tem sessão, redireciona pro /login. O Electron capta
 * esse redirect e abre a tela de login.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

export default function ChatDesktopLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (isPending) return
    // ?desktop=1 garante que após login o redirect vai pro /desktop-handshake
    // (gera token e devolve via oneclick-chat://) em vez do /dashboard padrão
    if (!session) router.push('/login?desktop=1')
  }, [isPending, session, router])

  // Aplica o tema escolhido em /chat-desktop/settings. Salvo em localStorage
  // como 'auto' | 'dark' | 'light' (chave oc-chat:theme). Default = dark.
  useEffect(() => {
    const html = document.documentElement
    const prev = html.classList.contains('dark')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    function apply() {
      const t = window.localStorage.getItem('oc-chat:theme') ?? 'dark'
      const dark = t === 'dark' || (t === 'auto' && mq.matches)
      html.classList.toggle('dark', dark)
    }

    apply()
    // Mudança via outra aba/janela → evento 'storage'
    window.addEventListener('storage', apply)
    // Mudança via mesma aba (settings page dispara isso após salvar)
    window.addEventListener('oc-chat-theme-change', apply)
    // Sistema mudou de claro/escuro (relevante no modo 'auto')
    mq.addEventListener('change', apply)

    return () => {
      window.removeEventListener('storage', apply)
      window.removeEventListener('oc-chat-theme-change', apply)
      mq.removeEventListener('change', apply)
      if (!prev) html.classList.remove('dark')
    }
  }, [])

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return <div className="dark min-h-screen bg-card text-foreground">{children}</div>
}
