'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, CornerDownRight } from 'lucide-react'
import type { NavGroup } from '@/lib/navigation'
import {
  cn,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@saas/ui'
import { SidebarItem } from './sidebar-item'

// Cor hex do grupo — fallback estático. Em runtime o ThemeProvider injeta
// `var(--mod-<slug>)` no :root e a UI usa isso (ver getGroupColor abaixo).
// Mantemos esse map só pra SSR/primeiro render antes do fetch.
const GROUP_HEX: Record<string, string> = {
  'Cadastros': '#34d399', 'Comercial': '#fb7185', 'Administrativo': '#38bdf8',
  'Legalização': '#e879f9', 'Trabalhista': '#a3e635', 'Fiscal': '#818cf8',
  'Contábil': '#a78bfa', 'TI': '#22d3ee', 'Qualidade': '#fbbf24', 'Configurações': '#fb923c',
  'Ajuda': '#0891b2',
}

// Mapeia label do grupo (PT) → slug usado nas CSS vars (--mod-<slug>).
const GROUP_SLUG: Record<string, string> = {
  'Cadastros': 'cadastros',
  'Comercial': 'comercial',
  'Administrativo': 'administrativo',
  'Legalização': 'legalizacao',
  'Trabalhista': 'trabalhista',
  'Fiscal': 'fiscal',
  'Contábil': 'contabil',
  'TI': 'ti',
  'Qualidade': 'qualidade',
  'Configurações': 'configuracoes',
  'Ajuda': 'faq',
}

/** Retorna a cor do grupo via CSS var (`var(--mod-<slug>, <fallback>)`).
 *  Usa essa função em vez de GROUP_HEX direto pra que mudanças no Design System
 *  propaguem em tempo real sem precisar de re-render. */
function getGroupColor(label: string): string {
  const slug = GROUP_SLUG[label]
  const fallback = GROUP_HEX[label] ?? '#5ea3cb'
  return slug ? `var(--mod-${slug}, ${fallback})` : fallback
}

interface SidebarGroupProps {
  group: NavGroup
  collapsed: boolean
  isOpen?: boolean
  onToggle?: () => void
}

export function SidebarGroup({ group, collapsed, isOpen, onToggle }: SidebarGroupProps) {
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const Icon = group.icon

  // Verificar se algum item do grupo está ativo
  const isGroupActive = group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
  const open = isOpen ?? isGroupActive

  // Quando colapsado: flyout dropdown à direita
  // `hex` agora é CSS var dinâmica (`var(--mod-<slug>, fallback)`).
  // Continua compatível com qualquer style={{color: hex}} ou backgroundColor.
  const hex = getGroupColor(group.label)

  if (collapsed) {
    return (
      <DropdownMenu onOpenChange={setDropdownOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            // a11y (WCAG 4.1.2): no modo recolhido o botão é só ícone — sem isto
            // o leitor de tela anuncia "botão, menu" sem nome. aria-label dá o
            // nome do módulo; title mostra tooltip nativa ao passar o mouse.
            aria-label={group.label}
            title={group.label}
            className={cn(
              'sidebar-group-btn flex w-full items-center justify-center rounded-lg px-2 py-2 outline-none focus:outline-none focus-visible:outline-none transition-all duration-200 cursor-pointer',
              (dropdownOpen || isGroupActive) ? 'hover:brightness-125' : 'text-muted-foreground',
              isGroupActive && !dropdownOpen && 'ring-1 ring-inset ring-white/15',
            )}
            style={{
              '--gc': hex,
              // Cor ativa/aberta = cor do MÓDULO (CSS var), não classe Tailwind fixa.
              ...((dropdownOpen || isGroupActive) ? { backgroundColor: `color-mix(in srgb, ${hex} 22%, transparent)`, color: hex } : {}),
            } as React.CSSProperties}
          >
            <Icon className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={14}
          className="dark w-56 !rounded-none border-y border-r border-l-0 shadow-xl !p-0 overflow-hidden max-h-[calc(100vh-80px)] flex flex-col !bg-sidebar text-sidebar-foreground"
          style={{ borderColor: `color-mix(in srgb, ${hex} 40%, transparent)` }}
        >
          {/* Header colorido do grupo */}
          <div className="-mx-px -mt-px px-3 py-2.5 shrink-0 border-b" style={{ backgroundColor: `color-mix(in srgb, ${hex} 20%, transparent)`, borderColor: `color-mix(in srgb, ${hex} 30%, transparent)` }}>
            <div className="flex items-center justify-center gap-2">
              <Icon className="h-3.5 w-3.5" style={{ color: hex }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: hex }}>
                {group.label}
              </span>
            </div>
          </div>
          {/* Itens com scroll */}
          <div className="py-1 overflow-y-auto scrollbar-none">
          {(() => {
            let lastCat: string | undefined = undefined
            return group.items.map((item) => {
              const ItemIcon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const showCatHeader = item.category && item.category !== lastCat
              lastCat = item.category
              return (
                <div key={item.href}>
                  {showCatHeader && (
                    <>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 py-1">{item.category}</DropdownMenuLabel>
                    </>
                  )}
                  {item.subItems && item.subItems.length > 0 ? (
                    <FlyoutSubmenu item={item} hex={hex} pathname={pathname} />
                  ) : (
                    <DropdownMenuItem asChild className="sidebar-group-btn focus:bg-transparent focus:text-inherit data-highlighted:bg-transparent" style={{ '--gc': hex } as React.CSSProperties}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 cursor-pointer',
                          isActive && 'font-medium',
                        )}
                        style={isActive ? { color: hex, backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)` } : undefined}
                      >
                        <ItemIcon className="h-4 w-4" style={isActive ? { color: hex } : undefined} />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </div>
              )
            })
          })()}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Quando expandido: accordion
  return (
    <Collapsible open={open} onOpenChange={() => onToggle?.()}>
      <div
        className={cn(
          'rounded-lg transition-all duration-200',
          open && 'border',
        )}
        style={open ? { borderColor: `color-mix(in srgb, ${hex} 40%, transparent)` } : undefined}
      >
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'sidebar-group-btn flex w-full items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer',
            open ? 'rounded-t-lg' : 'rounded-lg',
            (open || isGroupActive) ? 'hover:brightness-125' : (!open && 'text-foreground/70'),
            !open && isGroupActive && 'ring-1 ring-inset ring-white/15',
          )}
          style={{
            '--gc': hex,
            // Cor ativa/aberta = cor do MÓDULO (CSS var), não classe Tailwind fixa.
            ...((open || isGroupActive) ? { backgroundColor: `color-mix(in srgb, ${hex} 22%, transparent)`, color: hex } : {}),
          } as React.CSSProperties}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{group.label}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="sidebar-accordion px-2 pb-2 pt-1 space-y-0.5">
        {(() => {
          let lastCategory: string | undefined = undefined
          return group.items.map((item) => {
            const showCategoryHeader = item.category && item.category !== lastCategory
            lastCategory = item.category
            return (
              <div key={item.href}>
                {showCategoryHeader && (
                  <div className="mt-3 mb-1 pl-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{item.category}</span>
                  </div>
                )}
                {item.subItems && item.subItems.length > 0 ? (
                  <SidebarItemWithSubmenu item={item} hex={hex} pathname={pathname} />
                ) : (
                  <SidebarItem
                    label={item.label}
                    href={item.href}
                    icon={item.icon}
                    collapsed={false}
                    groupHex={hex}
                  />
                )}
              </div>
            )
          })
        })()}
      </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

/**
 * Item de sidebar com sub-menu (ex: Contratos → Cláusulas, Modelos, Relatórios).
 * O label/href do pai continua navegável (clique no nome → navega).
 * O chevron expande/recolhe a sub-lista. Abre automaticamente quando algum
 * sub-item está ativo.
 */
function SidebarItemWithSubmenu({ item, hex, pathname }: {
  item: { label: string; href: string; icon: any; subItems?: any[] }
  hex: string
  pathname: string
}) {
  const Icon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const subActive = item.subItems?.some((s: any) => pathname === s.href || pathname.startsWith(s.href + '/')) ?? false
  const [open, setOpen] = useState<boolean>(isActive || subActive)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <Link
          href={item.href}
          className={cn(
            'sidebar-group-btn flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer',
            isActive ? 'font-medium' : 'text-muted-foreground',
          )}
          style={{
            '--gc': hex,
            ...(isActive ? { backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)`, color: hex } : {}),
          } as React.CSSProperties}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground transition-colors cursor-pointer"
            aria-label="Expandir submenu"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="sidebar-accordion mt-0.5 ml-4 pl-2 border-l space-y-0.5"
        style={{ borderColor: `color-mix(in srgb, ${hex} 25%, transparent)` }}
      >
        {(item.subItems ?? []).map((sub: any) => {
          const SubIcon = sub.icon
          const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
          return (
            <Link
              key={sub.href}
              href={sub.href}
              className={cn(
                'sidebar-group-btn flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors cursor-pointer',
                subActive ? 'font-medium' : 'text-muted-foreground',
              )}
              style={{
                '--gc': hex,
                ...(subActive ? { backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)`, color: hex } : {}),
              } as React.CSSProperties}
            >
              <CornerDownRight className="h-3 w-3 shrink-0 opacity-50" />
              <SubIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{sub.label}</span>
            </Link>
          )
        })}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Flyout (sidebar recolhida): item-pai com sub-menu colapsável.
 * O nome/ícone navega normalmente; a setinha à direita expande/recolhe os
 * sub-itens SEM fechar o flyout. Abre automaticamente se um sub-item estiver
 * ativo. Espelha o comportamento de `SidebarItemWithSubmenu` (modo expandido).
 */
function FlyoutSubmenu({ item, hex, pathname }: {
  item: { label: string; href: string; icon: any; subItems?: any[] }
  hex: string
  pathname: string
}) {
  const Icon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const subActive = item.subItems?.some((s: any) => pathname === s.href || pathname.startsWith(s.href + '/')) ?? false
  const [open, setOpen] = useState<boolean>(subActive)

  return (
    <>
      <div className="flex items-stretch">
        <DropdownMenuItem asChild className="sidebar-group-btn flex-1 focus:bg-transparent focus:text-inherit data-highlighted:bg-transparent" style={{ '--gc': hex } as React.CSSProperties}>
          <Link
            href={item.href}
            className={cn('flex items-center gap-2 cursor-pointer', isActive && 'font-medium')}
            style={isActive ? { color: hex, backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)` } : undefined}
          >
            <Icon className="h-4 w-4" style={isActive ? { color: hex } : undefined} />
            {item.label}
          </Link>
        </DropdownMenuItem>
        <button
          type="button"
          aria-label={open ? 'Recolher submenu' : 'Expandir submenu'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
          className="flex items-center px-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
      {open && (item.subItems ?? []).map((sub: any) => {
        const SubIcon = sub.icon
        const subItemActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
        return (
          <DropdownMenuItem key={sub.href} asChild className="sidebar-group-btn focus:bg-transparent focus:text-inherit data-highlighted:bg-transparent pl-3" style={{ '--gc': hex } as React.CSSProperties}>
            <Link
              href={sub.href}
              className={cn('flex items-center gap-1.5 cursor-pointer text-[13px]', subItemActive && 'font-medium')}
              style={subItemActive ? { color: hex, backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)` } : undefined}
            >
              <CornerDownRight className="h-3 w-3 opacity-50 shrink-0" />
              <SubIcon className="h-3.5 w-3.5" style={subItemActive ? { color: hex } : undefined} />
              {sub.label}
            </Link>
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
