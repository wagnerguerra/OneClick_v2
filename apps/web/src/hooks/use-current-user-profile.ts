'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'

export interface CurrentUserProfile {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  isMaster: boolean
  isEmpresaMaster?: boolean
  empresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
  area?: { id: string; name: string } | null
  cargo?: { id: string; name: string } | null
}

const REFRESH_EVENT = 'current-user-profile-refresh'

// Cache em escopo de módulo — chaveado por userId pra não vazar entre sessões
// (login do user A → logout → login do user B mostrava dados do A).
let cachedProfile: CurrentUserProfile | null = null
let cachedUserId: string | null = null
let pendingPromise: Promise<CurrentUserProfile> | null = null
let pendingUserId: string | null = null

export function refreshCurrentUserProfile() {
  cachedProfile = null
  cachedUserId = null
  pendingPromise = null
  pendingUserId = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}

async function fetchProfile(expectedUserId: string | null): Promise<CurrentUserProfile> {
  // Cache hit só vale se o userId bater — protege contra trocas de usuário.
  if (cachedProfile && cachedUserId === expectedUserId) return cachedProfile
  // Reaproveita request em voo apenas se for pro mesmo userId
  if (pendingPromise && pendingUserId === expectedUserId) return pendingPromise
  // Caso contrário, descarta cache/promise antigos (do user anterior)
  cachedProfile = null
  cachedUserId = null
  pendingUserId = expectedUserId
  pendingPromise = (trpc.user as any).getMyProfile.query()
    .then((data: CurrentUserProfile) => {
      cachedProfile = data
      cachedUserId = data.id
      pendingPromise = null
      pendingUserId = null
      return data
    })
    .catch((e: unknown) => {
      pendingPromise = null
      pendingUserId = null
      throw e
    })
  return pendingPromise!
}

export function useCurrentUserProfile() {
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id ?? null
  // Profile só é considerado válido se bater com o user logado atual.
  const initial = cachedProfile && cachedUserId === sessionUserId ? cachedProfile : null
  const [profile, setProfile] = useState<CurrentUserProfile | null>(initial)
  const [loading, setLoading] = useState(!initial && !!sessionUserId)

  const load = useCallback(async () => {
    if (!sessionUserId) {
      // Sem session: limpa profile local e o cache de módulo.
      setProfile(null)
      setLoading(false)
      cachedProfile = null
      cachedUserId = null
      return
    }
    setLoading(true)
    try {
      const data = await fetchProfile(sessionUserId)
      setProfile(data)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [sessionUserId])

  // Recarrega sempre que o user logado muda (login, logout, troca de conta).
  useEffect(() => {
    if (!sessionUserId) {
      setProfile(null)
      setLoading(false)
      return
    }
    if (cachedProfile && cachedUserId === sessionUserId) {
      setProfile(cachedProfile)
      setLoading(false)
    } else {
      load()
    }
  }, [sessionUserId, load])

  useEffect(() => {
    function handler() { load() }
    window.addEventListener(REFRESH_EVENT, handler)
    return () => window.removeEventListener(REFRESH_EVENT, handler)
  }, [load])

  return { profile, loading }
}
