'use client'

import { UserCog } from 'lucide-react'
import { UserForm } from '../_components/user-form'

export default function NewUserPage() {
  return (
    <UserForm
      mode="create"
      title="Novo Usuário"
      description="Preencha os dados para cadastrar um novo usuário"
      icon={<UserCog className="h-6 w-6" />}
      iconBg="from-emerald-500 to-emerald-600"
    />
  )
}
