'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'

export interface PainelConfig {
  id: string
  slug: string
  nome: string
  accent: string
  icon?: string | null
  slideMs: number
  periodoDias: number
  folhas: Array<{
    id: string
    titulo: string
    ordem: number
    cols: number
    blocos: Array<{ id: string; ordem: number; visual: string; metricId: string; config: any }>
  }>
}

/**
 * Carrega config (getBySlug) + dados resolvidos (resolve) de um painel pela
 * slug. Auto-refresh dos DADOS a cada 60s (a config muda raramente).
 */
export function usePainelTv(slug: string) {
  const [painel, setPainel] = useState<PainelConfig | null>(null)
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const first = useRef(true)

  const loadConfig = useCallback(async () => {
    try {
      const p = await (trpc.painelTv as any).getBySlug.query({ slug })
      if (!p) { setErro(true); return null }
      setPainel(p)
      return p
    } catch {
      setErro(true)
      return null
    }
  }, [slug])

  const loadData = useCallback(async () => {
    try {
      const r = await (trpc.painelTv as any).resolve.query({ slug })
      setData(r?.data ?? {})
      setUpdatedAt(Date.now())
    } catch {
      /* mantém dados anteriores no erro de refresh */
    }
  }, [slug])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const p = await loadConfig()
      if (active && p) await loadData()
      if (active) { setLoading(false); first.current = false }
    })()
    return () => { active = false }
  }, [loadConfig, loadData])

  useEffect(() => {
    const id = setInterval(() => loadData(), 60_000)
    return () => clearInterval(id)
  }, [loadData])

  return { painel, data, loading, erro, updatedAt }
}
