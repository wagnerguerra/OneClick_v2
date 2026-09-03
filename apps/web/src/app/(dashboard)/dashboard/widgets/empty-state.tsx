'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'

interface Props {
  color: 'sky' | 'indigo' | 'fuchsia' | 'violet' | 'emerald' | 'amber' | 'rose'
  Icon: ComponentType<{ className?: string }>
  title: string
  message?: string
  href?: string
  showCheck?: boolean
  /** Cor hex do bloco da sidebar — sobrescreve a borda esquerda quando passada */
  bloco?: string
}

const COLORS: Record<Props['color'], string> = {
  sky:     'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300',
  violet:  'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  rose:    'bg-rose-500/10 text-rose-600 dark:text-rose-300',
}

export function EmptyState({ color, Icon, title, message, href, showCheck }: Props) {
  const inner = (
    <div className="flex h-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* Tile do modelo (stat card): quadrado rounded-xl tintado */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${COLORS[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{message}</p>}
        </div>
      </div>
      {showCheck && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
    </div>
  )
  return (
    <Card className="h-full overflow-hidden transition-shadow hover:shadow-md @container/widget">
      <CardContent className="h-full overflow-hidden p-4 @sm:p-5">
        {href ? <Link href={href} className="block h-full">{inner}</Link> : inner}
      </CardContent>
    </Card>
  )
}
