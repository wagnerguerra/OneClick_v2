'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { UserCog } from 'lucide-react'
import type { CreateUserInput, PermissionInput } from '@saas/types'
import { numeroParaMoeda, isoParaData } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { UserForm } from '../_components/user-form'

export default function EditUserPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<(Partial<CreateUserInput> & { isMaster?: boolean; permissions?: PermissionInput[] }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.user.getById
      .query({ id: params.id })
      .then((data) => {
        setUser({
          name: data.name,
          email: data.email,
          password: '',
          telefone: data.telefone ?? '',
          role: data.role as CreateUserInput['role'],
          profile: data.profile as CreateUserInput['profile'],
          empresaId: data.empresaId ?? '',
          areaId: data.areaId ?? '',
          cargoId: data.cargoId ?? '',
          salario: numeroParaMoeda(data.salario ? Number(data.salario) : null),
          dataAdmissao: data.dataAdmissao ? isoParaData(String(data.dataAdmissao)) : '',
          idOneClick: data.idOneClick ?? '',
          incluirFerias: data.incluirFerias,
          isActive: data.isActive,
          isMaster: data.isMaster,
          permissions: data.permissions,
        })
      })
      .catch(() => setError('Usuário não encontrado'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
      </div>
    )
  }

  if (error || !user) {
    return <div className="py-12 text-center text-muted-foreground">{error ?? 'Usuário não encontrado'}</div>
  }

  return (
    <UserForm
      mode="edit"
      userId={params.id}
      title="Editar Usuário"
      description="Altere os dados do usuário"
      icon={<UserCog className="h-6 w-6" />}
      iconBg="from-emerald-500 to-emerald-600"
      defaultValues={user}
    />
  )
}
