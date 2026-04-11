'use client'

import { Menu, Sun, Moon, Building2 } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/hooks/use-theme'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { Button } from '@saas/ui'
import { UserMenu } from './user-menu'

interface HeaderProps {
  onOpenMobile: () => void
}

export function Header({ onOpenMobile }: HeaderProps) {
  const { data: session } = useSession()
  const { theme, toggleTheme, mounted: themeMounted } = useTheme()
  const { empresa } = useEmpresaAtiva()

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
                src={empresa.logoUrl}
                alt={empresa.nomeFantasia ?? empresa.razaoSocial}
                className={`h-8 w-auto max-w-[140px] object-contain ${empresa.logoDarkUrl ? 'dark:hidden' : ''}`}
              />
              {/* Logo escuro (mostra só no dark) */}
              {empresa.logoDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={empresa.logoDarkUrl}
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

        {session?.user && (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            role={(session.user as Record<string, unknown>).role as string}
          />
        )}
      </div>
    </header>
  )
}
