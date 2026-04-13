'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import type { PermissionInput } from '@saas/types'

interface UserPermissionsState {
  isMaster: boolean
  role: string
  empresaId: string | null
  permissions: PermissionInput[]
  allowedSlugs: string[]
  loading: boolean
}

const REFRESH_EVENT = 'user-permissions-refresh'

export function refreshUserPermissions() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useUserPermissions(): UserPermissionsState {
  const [state, setState] = useState<UserPermissionsState>({
    isMaster: false,
    role: 'USER',
    empresaId: null,
    permissions: [],
    allowedSlugs: [],
    loading: true,
  })

  const load = useCallback(async () => {
    try {
      const data = await trpc.user.getMyPermissions.query()
      const allowedSlugs = data.isMaster
        ? [] // MASTER não precisa de lista — vê tudo
        : data.permissions.filter((p) => p.canRead).map((p) => p.moduleSlug)

      setState({
        isMaster: data.isMaster,
        role: data.role,
        empresaId: data.empresaId,
        permissions: data.permissions,
        allowedSlugs,
        loading: false,
      })
    } catch {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, load)
    return () => window.removeEventListener(REFRESH_EVENT, load)
  }, [load])

  return state
}
