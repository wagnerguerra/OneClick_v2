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
    if (!session) router.push('/login?from=chat-desktop')
  }, [isPending, session, router])

  // Força dark mode visualmente — a janela Electron é dark-only.
  useEffect(() => {
    const html = document.documentElement
    const prev = html.classList.contains('dark')
    html.classList.add('dark')
    return () => { if (!prev) html.classList.remove('dark') }
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
