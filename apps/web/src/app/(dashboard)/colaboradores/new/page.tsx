'use client'

import { Users } from 'lucide-react'
import { ColaboradorForm } from '../_components/colaborador-form'

export default function NewColaboradorPage() {
  return (
    <ColaboradorForm
      mode="create"
      title="Novo Colaborador"
      description="Preencha os dados para cadastrar um novo colaborador"
      icon={<Users className="h-6 w-6" />}
    />
  )
}
