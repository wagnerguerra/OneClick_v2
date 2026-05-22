'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'

interface Props {
  color: 'sky' | 'indigo' | 'fuchsia' | 'violet' | 'emerald' | 'amber'
  Icon: ComponentType<{ className?: string }>
  title: string
  message?: string
  href?: string
  showCheck?: boolean
  /** Cor hex do bloco da sidebar — sobrescreve a borda esquerda quando passada */
  bloco?: string
}

const COLORS: Record<Props['color'], { border: string; bg: string; iconText: string }> = {
  sky:      { border: 'border-l-sky-500',     bg: 'bg-sky-50 dark:bg-sky-900/20',         iconText: 'text-sky-600' },
  indigo:   { border: 'border-l-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-900/20',   iconText: 'text-indigo-600' },
  fuchsia:  { border: 'border-l-fuchsia-500', bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', iconText: 'text-fuchsia-600' },
  violet:   { border: 'border-l-violet-500',  bg: 'bg-violet-50 dark:bg-violet-900/20',   iconText: 'text-violet-600' },
  emerald:  { border: 'border-l-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconText: 'text-emerald-600' },
  amber:    { border: 'border-l-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20',     iconText: 'text-amber-600' },
}

export function EmptyState({ color, Icon, title, message, href, showCheck, bloco }: Props) {
  const c = COLORS[color]
  const inner = (
    <div className="flex items-center justify-between gap-3 h-full">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-4 w-4 @sm:h-5 @sm:w-5 ${c.iconText}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          {message && <p className="text-xs text-muted-foreground truncate">{message}</p>}
        </div>
      </div>
      {showCheck && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
    </div>
  )
  return (
    <Card
      className={`h-full border-l-4 ${c.border} overflow-hidden @container/widget`}
      style={bloco ? { borderLeftColor: bloco } : undefined}
    >
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
        {href ? <Link href={href} className="block h-full hover:opacity-80 transition-opacity">{inner}</Link> : inner}
      </CardContent>
    </Card>
  )
}
