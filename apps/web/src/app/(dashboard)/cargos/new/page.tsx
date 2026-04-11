'use client'

import { Briefcase } from 'lucide-react'
import { CargoForm } from '../_components/cargo-form'

export default function NewCargoPage() {
  return (
    <CargoForm
      mode="create"
      title="Novo Cargo"
      description="Preencha os dados para cadastrar um novo cargo"
      icon={<Briefcase className="h-6 w-6" />}
    />
  )
}
