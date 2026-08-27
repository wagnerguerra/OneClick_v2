'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { CreateEmpresaInput } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { EmpresaForm } from '../_components/empresa-form'

type EmpresaData = {
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string
  inscricaoEstadual: string | null
  inscricaoMunicipal: string | null
  taxRegime: string | null
  isActive: boolean
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  site: string | null
  logoUrl: string | null
  logoDarkUrl: string | null
  serproHabilitado: boolean | null
  serproOrcamentoMensal: number | null
}

export default function EditEmpresaPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [empresa, setEmpresa] = useState<(Partial<CreateEmpresaInput> & { code?: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.empresa.getById
      .query({ id: params.id })
      .then((data: EmpresaData) => {
        setEmpresa({
          code: data.code,
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia ?? '',
          cnpj: data.cnpj,
          inscricaoEstadual: data.inscricaoEstadual ?? '',
          inscricaoMunicipal: data.inscricaoMunicipal ?? '',
          taxRegime: (data.taxRegime as CreateEmpresaInput['taxRegime']) ?? undefined,
          isActive: data.isActive,
          cep: data.cep ?? '',
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          cidade: data.cidade ?? '',
          uf: data.uf ?? '',
          telefone: data.telefone ?? '',
          email: data.email ?? '',
          site: data.site ?? '',
          logoUrl: data.logoUrl ?? '',
          logoDarkUrl: data.logoDarkUrl ?? '',
          serproHabilitado: data.serproHabilitado ?? false,
          serproOrcamentoMensal: data.serproOrcamentoMensal ?? null,
        })
      })
      .catch(() => setError('Empresa não encontrada'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
      </div>
    )
  }

  if (error || !empresa) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {error ?? 'Empresa não encontrada'}
      </div>
    )
  }

  return (
    <EmpresaForm
      mode="edit"
      empresaId={params.id}
      title="Editar Empresa"
      description={`Empresa #${empresa.code}`}
      defaultValues={empresa}
    />
  )
}
