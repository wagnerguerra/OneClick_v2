'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'

/**
 * Busca o dashboard consolidado do Helpdesk (trpc.helpdesk.dashboard) para o
 * painel TI de TV. Janela padrão de `dias` (default 30). Auto-refresh 60s.
 * A chamada é "safe": qualquer erro/sem-permissão vira `erro=true` sem quebrar.
 */
export function useHelpdeskData(dias = 30) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const first = useRef(true)

  const reload = useCallback(async () => {
    if (first.current) setLoading(true)
    else setRefreshing(true)
    setErro(false)
    const inicio = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000).toISOString()
    const fim = new Date().toISOString()
    try {
      const d = await (trpc.helpdesk as any).dashboard.query({ inicio, fim })
      setData(d)
      setUpdatedAt(Date.now())
    } catch {
      setErro(true)
    } finally {
      first.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [dias])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    const id = setInterval(() => reload(), 60_000)
    return () => clearInterval(id)
  }, [reload])

  return { data, loading, refreshing, erro, updatedAt, reload }
}
