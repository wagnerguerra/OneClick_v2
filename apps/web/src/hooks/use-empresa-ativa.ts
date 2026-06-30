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

/**
 * "Empresa ativa" — SERVER-AUTHORITATIVE (F-012). A empresa ativa é persistida
 * no servidor (`users.active_empresa_id`) e resolvida em `empresa.getMyEmpresa`;
 * o localStorage é só CACHE de render, nunca a autoridade (era manipulável).
 *
 * - `loadEmpresa` lê a ativa do servidor (`getMyEmpresa`).
 * - `selectEmpresa` persiste no servidor (`setActiveEmpresa`, que valida acesso:
 *   não-master só a própria/home; master qualquer) e recarrega.
 *
 * O MESMO empresaId resolvido no servidor alimenta o ctx, as permissões
 * (`getMyPermissions.empresaId`) e a autorização — consistência garantida.
 * Não-master é sempre travado na home; só o master navega entre empresas.
 */
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
      // Server-authoritative (F-012): a empresa ATIVA vem do servidor —
      // getMyEmpresa resolve activeEmpresaId (master) ou a home (não-master).
      // O localStorage é só CACHE de render, nunca a autoridade.
      const active = await trpc.empresa.getMyEmpresa.query()
      if (active) {
        setEmpresa({
          id: active.id,
          code: active.code,
          razaoSocial: active.razaoSocial,
          nomeFantasia: active.nomeFantasia,
          logoUrl: active.logoUrl,
          logoDarkUrl: active.logoDarkUrl,
          marcaDaguaUrl: (active as any).marcaDaguaUrl ?? null,
        })
        try { localStorage.setItem(key, active.id) } catch { /* ignore */ }
      } else {
        setEmpresa(null)
      }
    } catch {
      // Sem empresa ou erro de auth
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

  const selectEmpresa = useCallback(async (id: string) => {
    // Persiste a empresa ativa NO SERVIDOR (valida acesso: não-master só a home;
    // master qualquer). A partir daí o ctx/permissões refletem a escolhida. F-012.
    try {
      await trpc.empresa.setActiveEmpresa.mutate({ empresaId: id })
    } catch {
      // Sem acesso à empresa (ex.: não-master tentando outra) — ignora a troca.
    }
    await loadEmpresa()
  }, [loadEmpresa])

  return { empresa, loading, selectEmpresa, refresh: loadEmpresa }
}
