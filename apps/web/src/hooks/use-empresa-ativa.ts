'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'

interface EmpresaAtiva {
  id: string
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  logoUrl: string | null
  logoDarkUrl: string | null
}

const STORAGE_KEY = 'empresa-ativa-id'
const REFRESH_EVENT = 'empresa-ativa-refresh'

/** Dispara evento global para atualizar o header */
export function refreshEmpresaAtiva() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useEmpresaAtiva() {
  const [empresa, setEmpresa] = useState<EmpresaAtiva | null>(null)
  const [loading, setLoading] = useState(true)

  const loadEmpresa = useCallback(async () => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY)

      if (savedId) {
        try {
          const data = await trpc.empresa.getById.query({ id: savedId })
          setEmpresa({
            id: data.id,
            code: data.code,
            razaoSocial: data.razaoSocial,
            nomeFantasia: data.nomeFantasia,
            logoUrl: data.logoUrl,
            logoDarkUrl: data.logoDarkUrl,
          })
          return
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      const list = await trpc.empresa.listForSelect.query()
      if (list.length > 0) {
        const first = list[0]!
        const data = await trpc.empresa.getById.query({ id: first.id })
        setEmpresa({
          id: data.id,
          code: data.code,
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          logoUrl: data.logoUrl,
        })
        localStorage.setItem(STORAGE_KEY, data.id)
      }
    } catch {
      // Sem empresas ou erro de auth
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEmpresa()
  }, [loadEmpresa])

  // Escutar evento de refresh (disparado quando a empresa é salva)
  useEffect(() => {
    function handleRefresh() {
      loadEmpresa()
    }
    window.addEventListener(REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, handleRefresh)
  }, [loadEmpresa])

  function selectEmpresa(id: string) {
    localStorage.setItem(STORAGE_KEY, id)
    loadEmpresa()
  }

  return { empresa, loading, selectEmpresa, refresh: loadEmpresa }
}
