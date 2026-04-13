'use client'

import { Building2 } from 'lucide-react'
import { EmpresaForm } from '../_components/empresa-form'

export default function NewEmpresaPage() {
  return (
    <EmpresaForm
      mode="create"
      title="Nova Empresa"
      description="Preencha os dados para cadastrar uma nova empresa"
      icon={<Building2 className="h-6 w-6" />}
    />
  )
}
