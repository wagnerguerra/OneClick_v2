'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn, Tooltip, TooltipTrigger, TooltipContent } from '@saas/ui'

interface SidebarItemProps {
  label: string
  href: string
  icon: LucideIcon
  collapsed: boolean
  groupHex?: string
}

export function SidebarItem({ label, href, icon: Icon, collapsed, groupHex }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  const content = (
    <Link
      href={href}
      // a11y: quando recolhido o link é só ícone (sem o <span> de texto) — o
      // aria-label garante o nome acessível (a Tooltip do Radix só descreve).
      aria-label={label}
      className={cn(
        'sidebar-group-btn flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer',
        isActive
          ? 'font-medium'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2',
      )}
      style={{
        '--gc': groupHex ?? '#5ea3cb',
        ...(isActive ? { backgroundColor: `color-mix(in srgb, ${groupHex ?? '#5ea3cb'} 15%, transparent)`, color: groupHex ?? '#5ea3cb' } : {}),
      } as React.CSSProperties}
    >
      <Icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return content
}
