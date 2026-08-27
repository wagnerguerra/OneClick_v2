'use client'

import { useSearchParams } from 'next/navigation'
import { SocioForm } from '../_components/socio-form'

export default function NewSocioPage() {
  // Permite abrir o form já vinculado a um cliente via ?clienteId=...
  // (usado pelo botão "Novo Sócio" na aba Legalização do detalhe do cliente).
  const sp = useSearchParams()
  const clienteId = sp.get('clienteId') ?? undefined
  return (
    <SocioForm
      mode="create"
      title="Novo Sócio"
      defaultValues={clienteId ? { clienteId } : undefined}
    />
  )
}
