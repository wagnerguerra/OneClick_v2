'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Package } from 'lucide-react'
import type { CreateFornecedorInput } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { FornecedorForm } from '../_components/fornecedor-form'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

interface FornecedorGetByIdResult {
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  tipoDocumento: string
  inscricaoEstadual: string | null
  inscricaoMunicipal: string | null
  tipoFornecedor: string
  categoria: string | null
  categoriaIds: string[] | null
  logoUrl: string | null
  risco: string | null
  avaliacaoObrigatoria: boolean | null
  telefone: string | null
  celular: string | null
  email: string | null
  site: string | null
  contatoPrincipal: string | null
  cargoContato: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pixChave: string | null
  pixTipo: string | null
  observacoes: string | null
  isActive: boolean
}

export default function EditFornecedorPage() {
  const params = useParams<{ id: string }>()
  const { profile } = useCurrentUserProfile()
  const [loading, setLoading] = useState(true)
  const [fornecedor, setFornecedor] = useState<(Partial<CreateFornecedorInput> & { code?: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.fornecedor.getById
      .query({ id: params.id })
      .then((data: FornecedorGetByIdResult) => {
        setFornecedor({
          code: data.code,
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia ?? '',
          documento: data.documento,
          tipoDocumento: data.tipoDocumento as CreateFornecedorInput['tipoDocumento'],
          inscricaoEstadual: data.inscricaoEstadual ?? '',
          inscricaoMunicipal: data.inscricaoMunicipal ?? '',
          tipoFornecedor: data.tipoFornecedor as CreateFornecedorInput['tipoFornecedor'],
          categoria: data.categoria ?? '',
          categoriaIds: data.categoriaIds ?? [],
          logoUrl: data.logoUrl ?? '',
          risco: (data.risco ?? 'MEDIO') as CreateFornecedorInput['risco'],
          avaliacaoObrigatoria: data.avaliacaoObrigatoria ?? false,
          telefone: data.telefone ?? '',
          celular: data.celular ?? '',
          email: data.email ?? '',
          site: data.site ?? '',
          contatoPrincipal: data.contatoPrincipal ?? '',
          cargoContato: data.cargoContato ?? '',
          cep: data.cep ?? '',
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          cidade: data.cidade ?? '',
          uf: data.uf ?? '',
          banco: data.banco ?? '',
          agencia: data.agencia ?? '',
          conta: data.conta ?? '',
          tipoConta: data.tipoConta ?? '',
          pixChave: data.pixChave ?? '',
          pixTipo: data.pixTipo ?? '',
          observacoes: data.observacoes ?? '',
          isActive: data.isActive,
        })
      })
      .catch(() => setError('Fornecedor não encontrado'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" /></div>
  }

  if (error || !fornecedor) {
    return <div className="py-12 text-center text-muted-foreground">{error ?? 'Fornecedor não encontrado'}</div>
  }

  return (
    <div className="space-y-5">
      <FornecedorForm
        mode="edit"
        fornecedorId={params.id}
        currentUserId={profile?.id}
        title="Editar Fornecedor"
        description={`Altere os dados do fornecedor #${fornecedor.code}`}
        icon={<Package className="h-6 w-6" />}
        defaultValues={fornecedor}
      />
    </div>
  )
}
