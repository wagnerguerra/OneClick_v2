'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
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

const GROUP_COLORS: Record<string, { label: string; bg: string; border: string; text: string; active: string; hover: string; trigger: string }> = {
  'Cadastros':     { label: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400', active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', hover: 'data-highlighted:bg-emerald-50 dark:data-highlighted:bg-emerald-950/30', trigger: 'bg-emerald-900/40 text-emerald-400' },
  'Corporativo':   { label: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/20', border: 'border-sky-200 dark:border-sky-800/40', text: 'text-sky-600 dark:text-sky-400', active: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300', hover: 'data-highlighted:bg-sky-50 dark:data-highlighted:bg-sky-950/30', trigger: 'bg-sky-900/40 text-sky-400' },
  'Qualidade':     { label: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800/40', text: 'text-amber-600 dark:text-amber-400', active: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', hover: 'data-highlighted:bg-amber-50 dark:data-highlighted:bg-amber-950/30', trigger: 'bg-amber-900/40 text-amber-400' },
  'Configurações': { label: 'text-orange-800 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800/40', text: 'text-orange-700 dark:text-orange-400', active: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', hover: 'data-highlighted:bg-orange-50 dark:data-highlighted:bg-orange-950/30', trigger: 'bg-orange-900/40 text-orange-400' },
}

interface SidebarGroupProps {
  group: NavGroup
  collapsed: boolean
}

export function SidebarGroup({ group, collapsed }: SidebarGroupProps) {
  const [open, setOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const pathname = usePathname()
  const Icon = group.icon

  // Quando colapsado: flyout dropdown à direita
  const gc = GROUP_COLORS[group.label]

  if (collapsed) {
    return (
      <DropdownMenu onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center justify-center rounded-lg px-2 py-2 outline-none focus:outline-none focus-visible:outline-none transition-colors',
              dropdownOpen
                ? gc?.trigger
                : 'text-muted-foreground hover:bg-[#5ea3cb]/10 hover:text-[#5ea3cb]',
            )}
          >
            <Icon className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={14} className="w-56 rounded-none border-0 shadow-xl py-0 overflow-hidden max-h-[calc(100vh-80px)] flex flex-col">
          {/* Header colorido do grupo */}
          <div className={cn('px-3 py-2.5 shrink-0', gc?.bg)}>
            <div className="flex items-center justify-center gap-2">
              <Icon className={cn('h-3.5 w-3.5', gc?.text)} />
              <span className={cn('text-[11px] font-bold uppercase tracking-widest', gc?.label)}>
                {group.label}
              </span>
            </div>
          </div>
          {/* Itens com scroll */}
          <div className="py-1 overflow-y-auto scrollbar-none">
          {group.items.map((item) => {
            const ItemIcon = item.icon
            const isActive = pathname === item.href
            return (
              <DropdownMenuItem key={item.href} asChild className={cn('focus:bg-transparent focus:text-inherit', gc?.hover)}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 cursor-pointer',
                    isActive && cn('font-medium', gc?.active),
                  )}
                >
                  <ItemIcon className={cn('h-4 w-4', isActive ? gc?.text : 'text-muted-foreground')} />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            )
          })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Quando expandido: accordion
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            'text-foreground/70 hover:bg-[#5ea3cb]/10 hover:text-[#5ea3cb]',
          )}
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
      <CollapsibleContent className="pl-3 pt-1 space-y-0.5">
        {group.items.map((item) => (
          <SidebarItem
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            collapsed={false}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
