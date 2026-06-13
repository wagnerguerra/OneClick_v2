'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/lib/trpc'

export interface ComercialData {
  crmStats: any
  crmFunil: any
  crmDesempenho: any[]
  orcStats: any
  orcDash: any
  contratos: any
}

/**
 * Busca consolidada dos KPIs comerciais (CRM + Orçamentos + Contratos).
 * Cada chamada é independente (safe): se um módulo não tiver permissão
 * (FORBIDDEN), os demais continuam. Auto-refresh a cada 60s (quadro de parede).
 *
 * Reutilizado pelo painel `/comercial` e pela versão TV `/tv/comercial`.
 */
export function useComercialData(dias?: number) {
  const [data, setData] = useState<ComercialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const first = useRef(true)

  const reload = useCallback(async () => {
    if (first.current) setLoading(true)
    else setRefreshing(true)
    setErro(false)
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.then((r) => r).catch(() => null)
    try {
      const [crmStats, crmFunil, crmDesempenho, orcStats, orcDash, contratos] = await Promise.all([
        safe((trpc.crm as any).getStats.query()),
        safe((trpc.crm as any).reportFunil.query({ dias })),
        safe((trpc.crm as any).reportDesempenho.query({ dias })),
        safe((trpc.orcamento as any).getStats.query()),
        safe((trpc.orcamento as any).getDashboardStats.query()),
        safe((trpc.contrato as any).reportComercial.query()),
      ])
      if (!crmStats && !crmFunil && !orcStats && !contratos) setErro(true)
      setData({
        crmStats,
        crmFunil,
        crmDesempenho: Array.isArray(crmDesempenho) ? crmDesempenho : [],
        orcStats,
        orcDash,
        contratos,
      })
      setUpdatedAt(Date.now())
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
