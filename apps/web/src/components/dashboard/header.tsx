'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Menu, Sun, Moon, Building2 } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/hooks/use-theme'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { TenantSwitcher } from './tenant-switcher'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { UserMenu } from './user-menu'
import { NotificationBell } from './notification-bell'
import { ClientErrorBadge } from './client-error-badge'
import { ChatHeaderButton } from '@/components/chat/chat-header-button'
import { QuickAccessMenu } from './quick-access-menu'
import { LayoutCustomizer } from './layout-customizer'
import { useLayoutPrefs } from '@/lib/layout-prefs'
import { cn } from '@saas/ui'

const TRUST_COOKIE = 'oc-trust-device'
const TRUST_PENDING_KEY = 'oc-trust-device-pending'

function setTrustCookie(token: string, expiresAt: Date) {
  document.cookie = `${TRUST_COOKIE}=${encodeURIComponent(token)}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`
}

interface HeaderProps {
  onOpenMobile: () => void
}

export function Header({ onOpenMobile }: HeaderProps) {
  const { data: session } = useSession()
  const { profile } = useCurrentUserProfile()
  const { theme, toggleTheme, mounted: themeMounted } = useTheme()
  const { empresa } = useEmpresaAtiva()
  const { prefs } = useLayoutPrefs()

  // Registra trust device pendente apos login com MFA (vem do sessionStorage setado em /login/2fa)
  useEffect(() => {
    if (!session?.user) return
    const pending = typeof window !== 'undefined' ? sessionStorage.getItem(TRUST_PENDING_KEY) : null
    if (!pending) return
    sessionStorage.removeItem(TRUST_PENDING_KEY)
    try {
      const data = JSON.parse(pending) as { label?: string; userAgent?: string }
      ;(trpc.user as any).registerMyTrustedDevice.mutate(data)
        .then((reg: { token?: string; expiresAt?: Date | string } | null) => {
          if (reg?.token && reg?.expiresAt) {
            setTrustCookie(reg.token, new Date(reg.expiresAt))
          }
        })
        .catch(() => { /* silencioso — nao critico */ })
    } catch { /* JSON invalido, ignora */ }
  }, [session?.user])

  const resolvedDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className={cn('z-30 flex h-[var(--app-header-offset)] items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm shadow-[0_2px_8px_rgba(15,23,42,0.04)] px-4 sm:px-6', prefs.headerFixo ? 'sticky top-0' : 'relative')}>
      <div className="flex min-w-0 items-center gap-2 sm:gap-6">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={onOpenMobile}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>

        {/* Logo/nome da empresa ativa — clicável, leva ao início (/dashboard) */}
        <Link href="/dashboard" title="Ir para o início" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          {empresa?.logoUrl ? (
            <>
              {/* Logo claro (esconde no dark) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAssetUrl(empresa.logoUrl)}
                alt={empresa.nomeFantasia ?? empresa.razaoSocial}
                className={`h-8 w-auto max-w-[104px] object-contain sm:max-w-[140px] ${empresa.logoDarkUrl ? 'dark:hidden' : ''}`}
              />
              {/* Logo escuro (mostra só no dark) */}
              {empresa.logoDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveAssetUrl(empresa.logoDarkUrl)}
                  alt={empresa.nomeFantasia ?? empresa.razaoSocial}
                  className="hidden h-8 w-auto max-w-[104px] object-contain sm:max-w-[140px] dark:block"
                />
              )}
            </>
          ) : empresa ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground hidden sm:block truncate max-w-[200px]">
                {empresa.nomeFantasia ?? empresa.razaoSocial}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground hidden sm:block">
              Dashboard
            </span>
          )}
        </Link>

        {/* Só o master vê: diz qual tenant está carregada e deixa trocar. */}
        <TenantSwitcher />

        {/* Acesso rápido — módulos fixados pelo usuário (sucessor da guia de abas).
            Escondido no celular: é atalho, e atalho não vale espremer o header. */}
        {session?.user && prefs.acessoRapido && (
          <span className="hidden sm:block"><QuickAccessMenu /></span>
        )}
      </div>

      {/* Grupo direito no padrão do modelo: ícones h-10 w-10 rounded-lg, gap-1 */}
      <div className="flex items-center gap-1">
        {/* Configurações de layout (customizer do modelo) — ajuste fino de
            desktop; no celular o layout é um só e o ícone só tomaria espaço. */}
        {session?.user && <span className="hidden sm:block"><LayoutCustomizer /></span>}
        {/* Theme toggle */}
        {themeMounted && (
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Alternar tema"
            className="hidden h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-foreground transition-colors hover:bg-muted sm:inline-flex"
          >
            <span key={resolvedDark ? 'sun' : 'moon'} className="flex animate-[fadeSlideIn_.15s_ease-out]">
              {resolvedDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </span>
          </button>
        )}

        {/* Chat interno — ícone com indicador de status próprio */}
        {session?.user && <ChatHeaderButton />}

        {/* Sino de notificações — só pra usuários autenticados */}
        {session?.user && <NotificationBell />}

        {/* Badge de erros JS do navegador — só em DEV, só pra logados */}
        {session?.user && <ClientErrorBadge />}

        {session?.user && (
          <UserMenu
            name={profile?.name ?? session.user.name}
            email={profile?.email ?? session.user.email}
            role={profile?.role ?? ((session.user as Record<string, unknown>).role as string)}
            image={profile?.image ?? ((session.user as Record<string, unknown>).image as string | null)}
            isMaster={profile?.isMaster ?? ((session.user as Record<string, unknown>).isMaster as boolean | undefined)}
          />
        )}
      </div>
    </header>
  )
}
