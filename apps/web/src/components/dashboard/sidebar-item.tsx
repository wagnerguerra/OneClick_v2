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
}

export function SidebarItem({ label, href, icon: Icon, collapsed }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href

  const content = (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        'hover:bg-[#5ea3cb]/10 hover:text-[#5ea3cb]',
        isActive
          ? 'bg-[#5ea3cb]/10 text-[#5ea3cb] font-medium'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2',
      )}
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
