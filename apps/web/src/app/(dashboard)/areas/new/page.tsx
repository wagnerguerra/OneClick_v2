'use client'

import { LayoutGrid } from 'lucide-react'
import { AreaForm } from '../_components/area-form'

export default function NewAreaPage() {
  return (
    <AreaForm
      mode="create"
      title="Nova Área"
      description="Preencha os dados para cadastrar uma nova área"
      icon={<LayoutGrid className="h-6 w-6" />}
    />
  )
}
