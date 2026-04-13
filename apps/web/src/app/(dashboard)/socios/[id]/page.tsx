'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import type { CreateSocioInput } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { SocioForm } from '../_components/socio-form'

export default function EditSocioPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [socio, setSocio] = useState<(Partial<CreateSocioInput> & { code?: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.socio.getById.query({ id: params.id })
      .then((data) => {
        setSocio({
          code: data.code,
          nomeCompleto: data.nomeCompleto,
          cpf: data.cpf,
          rg: data.rg ?? '',
          orgaoEmissor: data.orgaoEmissor ?? '',
          dataNascimento: data.dataNascimento ? new Date(data.dataNascimento).toISOString().slice(0, 10) : '',
          nacionalidade: data.nacionalidade ?? 'Brasileira',
          estadoCivil: data.estadoCivil as CreateSocioInput['estadoCivil'] ?? null,
          profissao: data.profissao ?? '',
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
          tipoSocio: data.tipoSocio as CreateSocioInput['tipoSocio'],
          participacao: data.participacao ? Number(data.participacao) : null,
          valorQuotas: data.valorQuotas ? Number(data.valorQuotas) : null,
          dataEntrada: data.dataEntrada ? new Date(data.dataEntrada).toISOString().slice(0, 10) : '',
          dataSaida: data.dataSaida ? new Date(data.dataSaida).toISOString().slice(0, 10) : '',
          assinaNaEmpresa: data.assinaNaEmpresa,
          responsavelLegal: data.responsavelLegal,
          observacoes: data.observacoes ?? '',
          clienteId: data.clienteId ?? '',
          isActive: data.isActive,
        })
      })
      .catch(() => setError('Sócio não encontrado'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" /></div>
  if (error || !socio) return <div className="py-12 text-center text-muted-foreground">{error ?? 'Sócio não encontrado'}</div>

  return <SocioForm mode="edit" socioId={params.id} title="Editar Sócio" description={`Altere os dados do sócio #${socio.code}`} icon={<UserPlus className="h-6 w-6" />} defaultValues={socio} />
}
