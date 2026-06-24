'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { ClienteForm } from '../_components/cliente-form'

export default function EditClientePage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [cliente, setCliente] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    trpc.cliente.getById.query({ id: params.id })
      .then((data) => setCliente(data as unknown as Record<string, unknown>))
      .catch(() => setCliente(null))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p>Cliente nao encontrado.</p>
      </div>
    )
  }

  // Converter datas e limpar nulls para compatibilidade com Zod (.optional() não aceita null)
  const defaultValues = Object.fromEntries(
    Object.entries({
      ...cliente,
      dataEntrada: cliente.dataEntrada ? new Date(cliente.dataEntrada as string).toISOString().slice(0, 10) : '',
      dataSaida: cliente.dataSaida ? new Date(cliente.dataSaida as string).toISOString().slice(0, 10) : '',
    }).map(([k, v]) => [k, v === null ? undefined : v])
  )

  return (
    <ClienteForm
      mode="edit"
      clienteId={params.id}
      defaultValues={defaultValues as Parameters<typeof ClienteForm>[0]['defaultValues']}
    />
  )
}
