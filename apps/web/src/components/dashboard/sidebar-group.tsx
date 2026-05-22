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

const GROUP_COLORS: Record<string, { label: string; bg: string; border: string; text: string; active: string; hover: string; trigger: string }> = {
  'Cadastros':     { label: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400', active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', hover: 'data-highlighted:bg-emerald-50 dark:data-highlighted:bg-emerald-950/30', trigger: 'bg-emerald-900/40 text-emerald-400' },
  'Comercial':     { label: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20', border: 'border-rose-200 dark:border-rose-800/40', text: 'text-rose-600 dark:text-rose-400', active: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', hover: 'data-highlighted:bg-rose-50 dark:data-highlighted:bg-rose-950/30', trigger: 'bg-rose-900/40 text-rose-400' },
  'Administrativo': { label: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/20', border: 'border-sky-200 dark:border-sky-800/40', text: 'text-sky-600 dark:text-sky-400', active: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300', hover: 'data-highlighted:bg-sky-50 dark:data-highlighted:bg-sky-950/30', trigger: 'bg-sky-900/40 text-sky-400' },
  'Legalização':   { label: 'text-fuchsia-700 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/20', border: 'border-fuchsia-200 dark:border-fuchsia-800/40', text: 'text-fuchsia-600 dark:text-fuchsia-400', active: 'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300', hover: 'data-highlighted:bg-fuchsia-50 dark:data-highlighted:bg-fuchsia-950/30', trigger: 'bg-fuchsia-900/40 text-fuchsia-400' },
  'Trabalhista':   { label: 'text-lime-700 dark:text-lime-400', bg: 'bg-lime-50 dark:bg-lime-950/20', border: 'border-lime-200 dark:border-lime-800/40', text: 'text-lime-600 dark:text-lime-400', active: 'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300', hover: 'data-highlighted:bg-lime-50 dark:data-highlighted:bg-lime-950/30', trigger: 'bg-lime-900/40 text-lime-400' },
  'Fiscal':        { label: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-indigo-200 dark:border-indigo-800/40', text: 'text-indigo-600 dark:text-indigo-400', active: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300', hover: 'data-highlighted:bg-indigo-50 dark:data-highlighted:bg-indigo-950/30', trigger: 'bg-indigo-900/40 text-indigo-400' },
  'Contábil':      { label: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-violet-200 dark:border-violet-800/40', text: 'text-violet-600 dark:text-violet-400', active: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300', hover: 'data-highlighted:bg-violet-50 dark:data-highlighted:bg-violet-950/30', trigger: 'bg-violet-900/40 text-violet-400' },
  'TI':            { label: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/20', border: 'border-cyan-200 dark:border-cyan-800/40', text: 'text-cyan-600 dark:text-cyan-400', active: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300', hover: 'data-highlighted:bg-cyan-50 dark:data-highlighted:bg-cyan-950/30', trigger: 'bg-cyan-900/40 text-cyan-400' },
  'Qualidade':     { label: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800/40', text: 'text-amber-600 dark:text-amber-400', active: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', hover: 'data-highlighted:bg-amber-50 dark:data-highlighted:bg-amber-950/30', trigger: 'bg-amber-900/40 text-amber-400' },
  'Configurações': { label: 'text-orange-800 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800/40', text: 'text-orange-700 dark:text-orange-400', active: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', hover: 'data-highlighted:bg-orange-50 dark:data-highlighted:bg-orange-950/30', trigger: 'bg-orange-900/40 text-orange-400' },
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
  const gc = GROUP_COLORS[group.label]
  // `hex` agora é CSS var dinâmica (`var(--mod-<slug>, fallback)`).
  // Continua compatível com qualquer style={{color: hex}} ou backgroundColor.
  const hex = getGroupColor(group.label)

  if (collapsed) {
    return (
      <DropdownMenu onOpenChange={setDropdownOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'sidebar-group-btn flex w-full items-center justify-center rounded-lg px-2 py-2 outline-none focus:outline-none focus-visible:outline-none transition-all duration-200 cursor-pointer',
              dropdownOpen
                ? gc?.trigger
                : isGroupActive
                  ? cn('ring-1 ring-inset ring-white/15 hover:brightness-125', gc?.trigger)
                  : 'text-muted-foreground',
            )}
            style={{ '--gc': hex } as React.CSSProperties}
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
                  {/* Sub-itens — renderizados indentados logo abaixo do pai, com setinha └→ */}
                  {item.subItems && item.subItems.length > 0 && item.subItems.map((sub) => {
                    const SubIcon = sub.icon
                    const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                    return (
                      <DropdownMenuItem key={sub.href} asChild className="sidebar-group-btn focus:bg-transparent focus:text-inherit data-highlighted:bg-transparent pl-3" style={{ '--gc': hex } as React.CSSProperties}>
                        <Link
                          href={sub.href}
                          className={cn(
                            'flex items-center gap-1.5 cursor-pointer text-[13px]',
                            subActive && 'font-medium',
                          )}
                          style={subActive ? { color: hex, backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)` } : undefined}
                        >
                          <CornerDownRight className="h-3 w-3 opacity-50 shrink-0" />
                          <SubIcon className="h-3.5 w-3.5" style={subActive ? { color: hex } : undefined} />
                          {sub.label}
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}
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
            open ? cn('rounded-t-lg hover:brightness-125', gc?.trigger) : 'rounded-lg',
            !open && (isGroupActive
              ? cn('ring-1 ring-inset ring-white/15 hover:brightness-125', gc?.trigger)
              : 'text-foreground/70'),
          )}
          style={{ '--gc': hex } as React.CSSProperties}
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
