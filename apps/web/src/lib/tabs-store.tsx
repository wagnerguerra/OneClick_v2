'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'

export interface Tab {
  id: string
  href: string
  label: string
  icon: string | null
  pinned: boolean
  ordem: number
}

interface TabsContextValue {
  tabs: Tab[]
  loading: boolean
  maxTabs: number
  // Operações otimistas — atualizam UI imediatamente e sincronizam no backend
  addOrFocus: (input: { href: string; label: string; icon?: string | null }) => Promise<Tab | null>
  updateLabel: (href: string, label: string) => Promise<void>
  close: (id: string) => Promise<void>
  closeMultiple: (ids: string[]) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>
  refetch: () => Promise<void>
}

const TabsContext = createContext<TabsContextValue | null>(null)

const SYNC_CHANNEL = 'oneclick-tabs-sync'

export function TabsProvider({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [loading, setLoading] = useState(true)
  const [maxTabs, setMaxTabs] = useState(10)
  const channelRef = useRef<BroadcastChannel | null>(null)

  // Carrega abas do backend e o limite configurado
  const refetch = useCallback(async () => {
    if (!userId) {
      setTabs([])
      setLoading(false)
      return
    }
    try {
      const [list, max] = await Promise.all([
        (trpc.tabs as any).listarMinhas.query() as Promise<Tab[]>,
        (trpc.tabs as any).getMaxTabs.query() as Promise<number>,
      ])
      setTabs(list)
      setMaxTabs(max)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refetch() }, [refetch])

  // BroadcastChannel — sincroniza abas entre múltiplas janelas/abas do navegador
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return
    const channel = new BroadcastChannel(SYNC_CHANNEL)
    channelRef.current = channel
    channel.onmessage = (e) => {
      // Eventos: 'tabs-changed' (refetch), 'data-changed' (invalidação direta)
      if (e.data?.type === 'tabs-changed' && e.data?.userId === userId) {
        refetch()
      }
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [userId, refetch])

  function broadcastChange() {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'tabs-changed', userId })
    }
  }

  const addOrFocus = useCallback(async (input: { href: string; label: string; icon?: string | null }) => {
    if (!userId) return null
    // Optimistic: se já existe, retorna sem mexer
    const existing = tabs.find(t => t.href === input.href)
    if (existing) return existing
    // Pré-checa limite
    if (tabs.length >= maxTabs) {
      // Erro suave — chamada do backend vai falhar mesmo, mas evitamos chamada desnecessária
      throw new Error(`Limite de ${maxTabs} abas atingido. Feche alguma para abrir outra.`)
    }
    try {
      const created = await (trpc.tabs as any).addOrGet.mutate(input) as Tab
      setTabs(prev => prev.find(t => t.id === created.id) ? prev : [...prev, created])
      broadcastChange()
      return created
    } catch (e) {
      throw e
    }
  }, [tabs, maxTabs, userId])

  const updateLabel = useCallback(async (href: string, label: string) => {
    const existente = tabs.find(t => t.href === href)
    if (!existente || existente.label === label) return
    // Optimistic
    setTabs(prev => prev.map(t => t.href === href ? { ...t, label } : t))
    try {
      await (trpc.tabs as any).updateLabel.mutate({ href, label })
      broadcastChange()
    } catch {
      /* silent — label não mudar não é crítico */
    }
  }, [tabs])

  const close = useCallback(async (id: string) => {
    // Otimista
    const before = tabs
    setTabs(prev => prev.filter(t => t.id !== id))
    try {
      await (trpc.tabs as any).close.mutate({ id })
      broadcastChange()
    } catch {
      setTabs(before) // revert
    }
  }, [tabs])

  const closeMultiple = useCallback(async (ids: string[]) => {
    const before = tabs
    setTabs(prev => prev.filter(t => !ids.includes(t.id)))
    try {
      await (trpc.tabs as any).closeMultiple.mutate({ ids })
      broadcastChange()
    } catch {
      setTabs(before)
    }
  }, [tabs])

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    const before = tabs
    setTabs(prev => prev.map(t => t.id === id ? { ...t, pinned } : t))
    try {
      await (trpc.tabs as any).setPinned.mutate({ id, pinned })
      broadcastChange()
    } catch (e) {
      setTabs(before)
      throw e // rethrow pra UI mostrar erro de permissão
    }
  }, [tabs])

  const reorder = useCallback(async (orderedIds: string[]) => {
    const before = tabs
    // Aplica nova ordem otimisticamente
    setTabs(prev => {
      const map = new Map(prev.map(t => [t.id, t]))
      return orderedIds.map((id, idx) => {
        const t = map.get(id)
        return t ? { ...t, ordem: idx } : null
      }).filter(Boolean) as Tab[]
    })
    try {
      await (trpc.tabs as any).reorder.mutate({ orderedIds })
      broadcastChange()
    } catch {
      setTabs(before)
    }
  }, [tabs])

  return (
    <TabsContext.Provider value={{ tabs, loading, maxTabs, addOrFocus, updateLabel, close, closeMultiple, setPinned, reorder, refetch }}>
      {children}
    </TabsContext.Provider>
  )
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs deve ser usado dentro de TabsProvider')
  return ctx
}

/**
 * Hook auxiliar para emitir eventos de "data changed" entre abas/janelas
 * abertas do mesmo navegador. Use depois de mutações para invalidar caches
 * em outras abas — ex: editou cliente → outras abas com lista de clientes
 * recebem o evento e fazem refetch.
 */
export function useBroadcastDataChange() {
  return useCallback((origem: string, payload?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    const channel = new BroadcastChannel(SYNC_CHANNEL)
    channel.postMessage({ type: 'data-changed', origem, payload, ts: Date.now() })
    channel.close()
  }, [])
}

/**
 * Hook para escutar invalidações de outras abas. Recebe um callback que
 * roda quando alguma aba (mesma origem) emite `data-changed` que case com
 * a origem informada (ou qualquer se omitido).
 */
export function useDataChangeListener(
  origens: string | string[] | null,
  onChange: (event: { origem: string; payload?: unknown }) => void,
) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const channel = new BroadcastChannel(SYNC_CHANNEL)
    const filtros = origens === null
      ? null
      : Array.isArray(origens) ? origens : [origens]
    channel.onmessage = (e) => {
      if (e.data?.type !== 'data-changed') return
      if (filtros && !filtros.includes(e.data.origem)) return
      onChange({ origem: e.data.origem, payload: e.data.payload })
    }
    return () => channel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(origens) ? origens.join(',') : origens])
}
