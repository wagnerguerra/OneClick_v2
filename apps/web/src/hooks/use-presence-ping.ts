'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trpc } from '@/lib/trpc'

/**
 * Dispara `presence.ping` toda vez que a rota muda. O backend usa o header
 * X-Page (já enviado pelo httpLink) pra atualizar `User.lastActivityPath` na
 * hora, mantendo o painel "Usuários online" do Service Manager em sincronia
 * com a aba que o user está visualizando.
 *
 * Sem isso, navegações puramente client-side (Next link entre páginas que
 * não disparam queries tRPC) não notificam o backend e a "página atual"
 * fica congelada na anterior.
 */
export function usePresencePing() {
  const pathname = usePathname()
  useEffect(() => {
    // Fire-and-forget — não precisa esperar resposta, só notificar
    trpc.presence.ping.mutate().catch(() => { /* offline ou logout, ignora */ })
  }, [pathname])
}
