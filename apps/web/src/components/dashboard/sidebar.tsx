'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeft, LayoutDashboard, Wrench, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn, Separator, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@saas/ui'
import { navigation } from '@/lib/navigation'

/**
 * Rotas sob /ferramentas que pertencem a OUTROS blocos. O item "Ferramentas" do
 * topo é o hub dos utilitários gerais e acende nas rotas dele; estas duas são
 * do Fiscal e do Contábil e não devem acendê-lo.
 */
const FERRAMENTAS_DE_OUTROS_BLOCOS = ['/ferramentas/fiscal', '/ferramentas/contabil']
import { SidebarGroup } from './sidebar-group'
import { SidebarItem } from './sidebar-item'
import { useNavegacaoPermitida } from '@/hooks/use-navegacao-permitida'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: SidebarProps) {
  // Sidebar é sempre dark, logo sempre versão light
  const logoSrc = '/logo-light.png'

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

  // O filtro de permissão da navegação virou hook: a busca global precisa da
  // MESMA lista, e duas cópias da regra dariam respostas diferentes.
  const { grupos: filteredNavigation, podeFerramentas } = useNavegacaoPermitida()

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
          'relative flex h-16 items-center border-b border-sidebar-border shrink-0',
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
                aria-label="Fechar menu"
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
              {podeFerramentas && (
                <SidebarItem
                  label="Ferramentas"
                  href="/ferramentas"
                  icon={Wrench}
                  collapsed
                  exceto={FERRAMENTAS_DE_OUTROS_BLOCOS}
                />
              )}
            </div>

            <Separator />

            {/* Blocos centralizados.
                `justify-center` num container que rola CORTA o começo quando o
                conteúdo não cabe — e o pedaço cortado fica inalcançável, porque
                a rolagem não vai para trás do início. Em telas de 768px de
                altura era o bloco Cadastros que sumia. Com `my-auto` no filho,
                centraliza quando sobra espaço e rola quando falta. */}
            <div className="flex flex-1 flex-col items-center overflow-y-auto scrollbar-none py-1">
              <div className="my-auto space-y-1">
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
              {/* Utilitários de uso geral, fora dos blocos de negócio. As rotas
                  fiscal/contábil moram sob o mesmo prefixo mas são de outros
                  blocos — por isso a exclusão. */}
              {podeFerramentas && (
                <SidebarItem
                  label="Ferramentas"
                  href="/ferramentas"
                  icon={Wrench}
                  collapsed={false}
                  exceto={FERRAMENTAS_DE_OUTROS_BLOCOS}
                />
              )}

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
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
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
          collapsed ? 'w-[80px]' : 'w-[260px]',
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
