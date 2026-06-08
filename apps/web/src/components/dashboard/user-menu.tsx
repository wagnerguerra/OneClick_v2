'use client'

import { useRouter } from 'next/navigation'
import { LogOut, User, Settings, HelpCircle, Bell, Crown, DownloadCloud } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@saas/ui'
import { signOut } from '@/lib/auth-client'
import { refreshCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { resolveAssetUrl } from '@/lib/api-url'
import { useTabs } from '@/lib/tabs-store'

interface UserMenuProps {
  name: string
  email: string
  role?: string
  image?: string | null
  isMaster?: boolean
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

export function UserMenu({ name, email, role, image, isMaster }: UserMenuProps) {
  const router = useRouter()
  const { tabs, closeMultiple } = useTabs()
  // /configuracoes contém ajustes administrativos (Stripe, SMTP, S3, integrações,
  // etc.) — só master/empresa-master pode acessar.
  const canAccessConfig = !!isMaster

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors outline-none">
          <div className="relative">
            <Avatar className="h-9 w-9">
              {image && <AvatarImage src={resolveAssetUrl(image)} alt={name} />}
              <AvatarFallback className="bg-[#5ea3cb] text-white text-xs font-medium">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            {isMaster && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center"
                title="Usuário Master"
                aria-label="Usuário Master"
              >
                <Crown
                  className="h-4 w-4 text-orange-500 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.4)]"
                  fill="#fb923c"
                  strokeWidth={1.5}
                  style={{ transform: 'rotate(15deg)' }}
                />
              </span>
            )}
          </div>
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
        <DropdownMenuItem onClick={() => router.push('/perfil')} className="gap-2 px-3 py-2 group">
          <User className="h-4 w-4 text-muted-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground" />
          Meu Perfil
        </DropdownMenuItem>
        {canAccessConfig && (
          <DropdownMenuItem onClick={() => router.push('/configuracoes')} className="gap-2 px-3 py-2 group">
            <Settings className="h-4 w-4 text-muted-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground" />
            Configurações
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => router.push('/faq')} className="gap-2 px-3 py-2 group">
          <HelpCircle className="h-4 w-4 text-muted-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground" />
          Ajuda
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/downloads')} className="gap-2 px-3 py-2 group">
          <DownloadCloud className="h-4 w-4 text-muted-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground" />
          Downloads
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Logout */}
        <DropdownMenuItem
          onClick={async () => {
            // Dispara o fechamento das abas não fixadas em background — mutation
            // tem optimistic update local e a chamada API é best-effort. NÃO usar
            // await: se a tRPC demorar/falhar, não queremos bloquear o logout.
            const unpinnedIds = tabs.filter(t => !t.pinned).map(t => t.id)
            if (unpinnedIds.length > 0) {
              closeMultiple(unpinnedIds).catch((e: unknown) =>
                console.warn('[Logout] Falha ao fechar abas não fixadas:', (e as Error).message),
              )
            }
            // signOut tenta invalidar a sessão no servidor — mas se a API estiver
            // fora do ar/network falhar, ainda assim faz logout local (limpa
            // cache e redireciona) pra não deixar o user preso.
            try {
              await signOut()
            } catch (e) {
              console.warn('[Logout] Falha ao chamar signOut remoto, fazendo logout local:', (e as Error).message)
            }
            // Limpa o cache module-level do profile para que o próximo login
            // não veja dados do usuário anterior.
            refreshCurrentUserProfile()
            router.push('/login')
          }}
          className="gap-2 px-3 py-2 text-destructive focus:bg-destructive focus:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white group"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
