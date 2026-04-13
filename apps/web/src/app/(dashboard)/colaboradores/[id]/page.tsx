'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Users } from 'lucide-react'
import type { CreateColaboradorInput } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { ColaboradorForm } from '../_components/colaborador-form'

export default function EditColaboradorPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [colaborador, setColaborador] = useState<(Partial<CreateColaboradorInput> & { code?: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.colaborador.getById
      .query({ id: params.id })
      .then((data) => {
        setColaborador({
          code: data.code,
          nomeCompleto: data.nomeCompleto,
          cpf: data.cpf,
          rg: data.rg ?? '',
          orgaoEmissor: data.orgaoEmissor ?? '',
          dataNascimento: data.dataNascimento ? new Date(data.dataNascimento).toISOString().slice(0, 10) : '',
          sexo: data.sexo as CreateColaboradorInput['sexo'] ?? null,
          estadoCivil: data.estadoCivil as CreateColaboradorInput['estadoCivil'] ?? null,
          nacionalidade: data.nacionalidade ?? 'Brasileira',
          naturalidade: data.naturalidade ?? '',
          fotoUrl: data.fotoUrl ?? '',
          pis: data.pis ?? '',
          ctps: data.ctps ?? '',
          ctpsSerie: data.ctpsSerie ?? '',
          tituloEleitor: data.tituloEleitor ?? '',
          reservista: data.reservista ?? '',
          email: data.email ?? '',
          telefone: data.telefone ?? '',
          celular: data.celular ?? '',
          cep: data.cep ?? '',
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          cidade: data.cidade ?? '',
          uf: data.uf ?? '',
          tipoContrato: data.tipoContrato as CreateColaboradorInput['tipoContrato'],
          dataAdmissao: data.dataAdmissao ? new Date(data.dataAdmissao).toISOString().slice(0, 10) : '',
          dataDemissao: data.dataDemissao ? new Date(data.dataDemissao).toISOString().slice(0, 10) : '',
          salario: data.salario ? Number(data.salario) : null,
          cargaHoraria: data.cargaHoraria,
          incluirFerias: data.incluirFerias,
          observacoes: data.observacoes ?? '',
          areaId: data.areaId ?? '',
          cargoId: data.cargoId ?? '',
          userId: data.userId ?? '',
          isActive: data.isActive,
        })
      })
      .catch(() => setError('Colaborador não encontrado'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
      </div>
    )
  }

  if (error || !colaborador) {
    return <div className="py-12 text-center text-muted-foreground">{error ?? 'Colaborador não encontrado'}</div>
  }

  return (
    <ColaboradorForm
      mode="edit"
      colaboradorId={params.id}
      title="Editar Colaborador"
      description={`Altere os dados do colaborador #${colaborador.code}`}
      icon={<Users className="h-6 w-6" />}
      defaultValues={colaborador}
    />
  )
}
