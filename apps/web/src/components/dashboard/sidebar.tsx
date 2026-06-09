'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeft, LayoutDashboard, X } from 'lucide-react'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { cn, ScrollArea, Separator, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@saas/ui'
import { navigation } from '@/lib/navigation'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { SidebarGroup } from './sidebar-group'
import { SidebarItem } from './sidebar-item'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: SidebarProps) {
  // Sidebar é sempre dark, logo sempre versão light
  const logoSrc = '/logo-light.png'

  // Filtrar navigation baseado nas permissões do usuário
  const { isMaster, allowedSlugs, loading: permsLoading } = useUserPermissions()

  const pathname = usePathname()

  // Controle de accordion: apenas um grupo aberto por vez
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    for (const group of navigation) {
      if (group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))) {
        return group.label
      }
    }
    return null
  })

  // Atualizar grupo aberto quando a rota muda
  useEffect(() => {
    for (const group of navigation) {
      if (group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))) {
        setOpenGroup(group.label)
        return
      }
    }
  }, [pathname])

  const filteredNavigation = useMemo(() => {
    if (isMaster) return navigation // MASTER vê tudo
    return navigation
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          // FAQ é conteúdo de ajuda — sempre visível pra qualquer usuário,
          // independentemente da matriz de permissões.
          if (item.href === '/faq') return true
          const slug = item.href.replace('/', '')
          return allowedSlugs.includes(slug)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [isMaster, allowedSlugs])

  // Fechar com Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseMobile()
    }
    if (mobileOpen) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [mobileOpen, onCloseMobile])

  const sidebarContent = (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn(
          'relative flex h-14 items-center border-b border-sidebar-border shrink-0',
          collapsed && !mobileOpen ? 'justify-center px-2' : 'justify-center px-3',
        )}>
          {collapsed && !mobileOpen ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link href="/dashboard" aria-label="Ir para o início">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-sm.png" alt="OneClick" className="h-6 w-auto" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Início</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Link href="/dashboard" aria-label="Ir para o início" className="transition-opacity hover:opacity-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt="OneClick" className="h-[24px] w-auto object-contain" />
              </Link>
              {/* Botão fechar - mobile only */}
              <button
                onClick={onCloseMobile}
                className="lg:hidden absolute right-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        {collapsed && !mobileOpen ? (
          /* Collapsed: Dashboard topo, blocos centralizados, toggle fundo */
          <div className="flex flex-1 flex-col overflow-hidden px-3">
            {/* Dashboard fixo no topo */}
            <div className="shrink-0 pt-4 pb-2">
              <SidebarItem
                label="Dashboard"
                href="/dashboard"
                icon={LayoutDashboard}
                collapsed
              />
            </div>

            <Separator />

            {/* Blocos centralizados */}
            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto scrollbar-none">
              <div className="space-y-1">
                {filteredNavigation.map((group) => (
                  <SidebarGroup
                    key={group.label}
                    group={group}
                    collapsed
                    isOpen={openGroup === group.label}
                    onToggle={() => setOpenGroup(prev => prev === group.label ? null : group.label)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Expanded: layout normal */
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-none">
            <div className="space-y-1">
              <SidebarItem
                label="Dashboard"
                href="/dashboard"
                icon={LayoutDashboard}
                collapsed={false}
              />

              <Separator className="my-3" />

              <div className="space-y-1">
                {filteredNavigation.map((group) => (
                  <SidebarGroup
                    key={group.label}
                    group={group}
                    collapsed={false}
                    isOpen={openGroup === group.label}
                    onToggle={() => setOpenGroup(prev => prev === group.label ? null : group.label)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Toggle button — desktop only */}
        <div className="hidden lg:block border-t border-sidebar-border p-3">
          <button
            onClick={onToggle}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Recolher</span>
              </>
            )}
          </button>
        </div>
      </div>
    </TooltipProvider>
  )

  return (
    <>
      {/* Desktop sidebar — sempre dark */}
      <aside
        className={cn(
          'dark fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-[260px]',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-overlay lg:hidden animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />
          {/* Sidebar drawer — sempre dark */}
          <aside className="dark fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-sidebar text-sidebar-foreground shadow-xl lg:hidden animate-in slide-in-from-left duration-300">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
