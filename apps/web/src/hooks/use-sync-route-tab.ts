'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTabs } from '@/lib/tabs-store'
import { resolveRouteMeta } from '@/lib/route-meta'
import { useLayoutPrefs } from '@/lib/layout-prefs'

const ROTAS_ENCAMINHADORAS = new Set(['/acessorias'])

/**
 * Hook que sincroniza a rota atual com o sistema de abas:
 *  • Ao navegar para uma rota, se ainda não houver aba aberta para ela,
 *    cria automaticamente uma aba.
 *  • Se já existe aba para essa rota, ativa (apenas pelo `pathname`).
 *
 * Deve ser montado uma única vez no layout principal (após TabsProvider).
 */
export function useSyncRouteTab() {
  const pathname = usePathname()
  const { tabs, addOrFocus } = useTabs()
  const { prefs } = useLayoutPrefs()
  const lastSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    // Abas são opcionais (Configurações de layout) — desligadas, nada é criado
    if (!prefs.abas) return
    if (!pathname) return
    // Ignora rotas que não devem virar aba
    if (
      pathname === '/login'
      || pathname === '/onboarding'
      || pathname.startsWith('/login/')
      || pathname.startsWith('/api/')
      || ROTAS_ENCAMINHADORAS.has(pathname)
    ) return

    if (lastSyncedRef.current === pathname) return
    lastSyncedRef.current = pathname

    const pathClean = pathname.split('?')[0]!.split('#')[0]!
    const existing = tabs.find(t => {
      const tClean = t.href.split('?')[0]!.split('#')[0]
      return tClean === pathClean
    })
    if (existing) return // já tem aba — ativação é puramente visual via pathname match

    const meta = resolveRouteMeta(pathname)
    if (!meta) return

    // Cria aba (silenciosamente — se der erro de limite, o user verá no próximo addOrFocus)
    addOrFocus({ href: pathClean, label: meta.label, icon: meta.icon }).catch(() => {
      /* limite atingido — silent, evita poluir UX */
    })
  }, [pathname, tabs, addOrFocus, prefs.abas])
}
