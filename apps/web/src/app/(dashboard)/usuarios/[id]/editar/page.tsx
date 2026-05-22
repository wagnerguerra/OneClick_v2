'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { UserCog } from 'lucide-react'
import type { CreateUserInput, PermissionInput } from '@saas/types'
import { numeroParaMoeda, isoParaData } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { UserForm } from '../../_components/user-form'
import { useTabLabel } from '@/hooks/use-tab-label'

export default function EditUserPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<(Partial<CreateUserInput> & { isMaster?: boolean; permissions?: PermissionInput[] }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  useTabLabel(user?.name ? `Usuário: ${user.name}` : null)

  useEffect(() => {
    if (!params.id) return
    trpc.user.getById
      .query({ id: params.id })
      .then((data: any) => {
        setUser({
          name: data.name,
          email: data.email,
          password: '',
          telefone: data.telefone ?? '',
          celular: data.celular ?? '',
          ramal: data.ramal ?? '',
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
          exibirComoColaborador: data.exibirComoColaborador ?? false,
          // Documentos pessoais
          cpf: data.cpf ?? '',
          rg: data.rg ?? '',
          orgaoEmissor: data.orgaoEmissor ?? '',
          dataNascimento: data.dataNascimento ? isoParaData(String(data.dataNascimento)) : '',
          sexo: data.sexo ?? '',
          estadoCivil: data.estadoCivil ?? '',
          nacionalidade: data.nacionalidade ?? 'Brasileira',
          naturalidade: data.naturalidade ?? '',
          // Endereço
          cep: data.cep ?? '',
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          cidade: data.cidade ?? '',
          uf: data.uf ?? '',
          // Contrato / RH
          tipoContrato: data.tipoContrato ?? 'CLT',
          dataDemissao: data.dataDemissao ? isoParaData(String(data.dataDemissao)) : '',
          cargaHoraria: data.cargaHoraria ?? 44,
          observacoes: data.observacoes ?? '',
          permissions: data.permissions,
        } as any)
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
      defaultValues={user}
    />
  )
}
