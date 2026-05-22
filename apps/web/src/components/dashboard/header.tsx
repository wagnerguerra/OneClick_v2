'use client'

import { useEffect } from 'react'
import { Menu, Sun, Moon, Building2 } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/hooks/use-theme'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { UserMenu } from './user-menu'
import { NotificationBell } from './notification-bell'
import { ClientErrorBadge } from './client-error-badge'

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="flex items-center gap-3">
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

        {/* Logo/nome da empresa ativa */}
        <div className="flex items-center gap-2.5">
          {empresa?.logoUrl ? (
            <>
              {/* Logo claro (esconde no dark) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAssetUrl(empresa.logoUrl)}
                alt={empresa.nomeFantasia ?? empresa.razaoSocial}
                className={`h-8 w-auto max-w-[140px] object-contain ${empresa.logoDarkUrl ? 'dark:hidden' : ''}`}
              />
              {/* Logo escuro (mostra só no dark) */}
              {empresa.logoDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveAssetUrl(empresa.logoDarkUrl)}
                  alt={empresa.nomeFantasia ?? empresa.razaoSocial}
                  className="h-8 w-auto max-w-[140px] object-contain hidden dark:block"
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
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme toggle */}
        {themeMounted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleTheme}
          >
            {resolvedDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="sr-only">Alternar tema</span>
          </Button>
        )}

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
