'use client'

/**
 * Layout do segmento /tv — modo "quadro de parede" (TV/kiosk).
 * SEM sidebar, header, tabbar, page transitions — tela cheia pura, dark forçado.
 *
 * Mantém a PROTEÇÃO por login: se não há sessão, redireciona pro /login
 * (a página ficará exposta na VPS, então não pode ser pública). A sessão do
 * better-auth persiste no navegador da TV — basta logar uma vez.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

export default function TvLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (isPending) return
    if (!session) router.push('/login')
  }, [isPending, session, router])

  // Dark forçado enquanto a TV está aberta; restaura ao sair.
  useEffect(() => {
    const html = document.documentElement
    const prev = html.classList.contains('dark')
    html.classList.add('dark')
    return () => {
      if (!prev) html.classList.remove('dark')
    }
  }, [])

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
      </div>
    )
  }

  return <div className="bg-background text-foreground">{children}</div>
}
