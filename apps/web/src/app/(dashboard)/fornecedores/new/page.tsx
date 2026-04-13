'use client'

import { Package } from 'lucide-react'
import { FornecedorForm } from '../_components/fornecedor-form'

export default function NewFornecedorPage() {
  return (
    <FornecedorForm
      mode="create"
      title="Novo Fornecedor"
      description="Preencha os dados para cadastrar um novo fornecedor"
      icon={<Package className="h-6 w-6" />}
    />
  )
}
