'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'

interface EmpresaAtiva {
  id: string
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  logoUrl: string | null
  logoDarkUrl: string | null
  marcaDaguaUrl: string | null
}

// Storage é scoped por userId — sem isso o próximo login herdaria a empresa
// ativa do anterior (ex: master volta e abre na empresa do outro usuário).
const STORAGE_KEY_PREFIX = 'empresa-ativa-id'
const LEGACY_KEY = 'empresa-ativa-id' // chave antiga (sem prefixo); ignoramos.
const REFRESH_EVENT = 'empresa-ativa-refresh'

function storageKey(userId: string | undefined): string | null {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : null
}

/** Dispara evento global para atualizar o header */
export function refreshEmpresaAtiva() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useEmpresaAtiva() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [empresa, setEmpresa] = useState<EmpresaAtiva | null>(null)
  const [loading, setLoading] = useState(true)

  const loadEmpresa = useCallback(async () => {
    const key = storageKey(userId)
    if (!key) return // aguardando session resolver

    // Limpa chave legada (sem userId) — uma vez por sessão, evita herança.
    try { localStorage.removeItem(LEGACY_KEY) } catch { /* ignore */ }

    try {
      const savedId = localStorage.getItem(key)

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
            marcaDaguaUrl: (data as any).marcaDaguaUrl ?? null,
          })
          return
        } catch {
          localStorage.removeItem(key)
        }
      }

      // Tentar listar empresas (requer permissão no módulo empresas)
      try {
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
            logoDarkUrl: data.logoDarkUrl,
            marcaDaguaUrl: (data as any).marcaDaguaUrl ?? null,
          })
          localStorage.setItem(key, data.id)
          return
        }
      } catch {
        // Sem permissão no módulo empresas — buscar empresa do próprio usuário
      }

      // Fallback: buscar empresa vinculada ao usuário logado
      const myEmpresa = await trpc.empresa.getMyEmpresa.query()
      if (myEmpresa) {
        setEmpresa({
          id: myEmpresa.id,
          code: myEmpresa.code,
          razaoSocial: myEmpresa.razaoSocial,
          nomeFantasia: myEmpresa.nomeFantasia,
          logoUrl: myEmpresa.logoUrl,
          logoDarkUrl: myEmpresa.logoDarkUrl,
          marcaDaguaUrl: (myEmpresa as any).marcaDaguaUrl ?? null,
        })
        localStorage.setItem(key, myEmpresa.id)
      }
    } catch {
      // Sem empresas ou erro de auth
    } finally {
      setLoading(false)
    }
  }, [userId])

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

  const selectEmpresa = useCallback((id: string) => {
    const key = storageKey(userId)
    if (key) localStorage.setItem(key, id)
    loadEmpresa()
  }, [userId, loadEmpresa])

  return { empresa, loading, selectEmpresa, refresh: loadEmpresa }
}
