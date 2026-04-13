'use client'

import { useRouter } from 'next/navigation'
import { LogOut, User, Settings, HelpCircle, Bell } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@saas/ui'
import { signOut } from '@/lib/auth-client'

interface UserMenuProps {
  name: string
  email: string
  role?: string
  image?: string | null
}

const ROLE_LABELS: Record<string, string> = {
  COLABORADOR_INTERNO: 'Colaborador Interno', PRESTADOR_SERVICO: 'Prestador de Serviço',
  COLABORADOR_CLIENTE: 'Colab. Cliente', GESTOR: 'Gestor', COORDENADOR: 'Coordenador', DIRETOR: 'Diretor',
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function getFirstName(name: string) {
  return name.split(' ')[0] ?? name
}

export function UserMenu({ name, email, role }: UserMenuProps) {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors outline-none">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-[#5ea3cb] text-white text-xs font-medium">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium leading-tight text-foreground">{getFirstName(name)}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{role ? (ROLE_LABELS[role] ?? role) : email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Greeting */}
        <DropdownMenuLabel className="font-normal px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">Olá, {getFirstName(name)}!</p>
          <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Menu items */}
        <DropdownMenuItem onClick={() => router.push('/configuracoes')} className="gap-2 px-3 py-2">
          <User className="h-4 w-4 text-muted-foreground" />
          Perfil
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/configuracoes')} className="gap-2 px-3 py-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {}} className="gap-2 px-3 py-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Ajuda
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Logout */}
        <DropdownMenuItem
          onClick={async () => {
            await signOut()
            router.push('/login')
          }}
          className="gap-2 px-3 py-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
