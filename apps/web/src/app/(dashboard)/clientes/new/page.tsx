'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClienteForm } from '../_components/cliente-form'
import { useClientesPerms } from '../_components/use-clientes-perms'

export default function NewClientePage() {
  const router = useRouter()
  const { canCreate, loading } = useClientesPerms()

  // Sem a sub-permissão 'create_client' não pode cadastrar — volta pra lista.
  // Espera carregar as permissões pra não redirecionar quem tem acesso.
  useEffect(() => {
    if (!loading && !canCreate) router.replace('/clientes')
  }, [loading, canCreate, router])

  if (loading || !canCreate) return null
  return <ClienteForm mode="create" />
}
