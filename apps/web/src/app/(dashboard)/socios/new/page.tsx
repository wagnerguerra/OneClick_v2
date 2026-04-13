'use client'

import { UserPlus } from 'lucide-react'
import { SocioForm } from '../_components/socio-form'

export default function NewSocioPage() {
  return <SocioForm mode="create" title="Novo Sócio" description="Preencha os dados para cadastrar um novo sócio" icon={<UserPlus className="h-6 w-6" />} />
}
