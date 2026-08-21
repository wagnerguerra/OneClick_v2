'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { cn } from '@saas/ui'

export type KpiColor = 'red' | 'orange' | 'amber' | 'gray' | 'emerald' | 'rose' | 'sky' | 'indigo' | 'violet' | 'fuchsia'

// Tons do modelo: fundo tintado a 10%, ícone em círculo com anel interno, número
// em destaque e rótulo pequeno — mesma receita dos stat tiles do LuminAux.
const STYLE: Record<KpiColor, { chip: string; icon: string }> = {
  red:     { chip: 'bg-red-500/10 text-red-700 dark:text-red-300',             icon: 'bg-red-500/15 text-red-600 dark:text-red-300' },
  orange:  { chip: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',    icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-300' },
  amber:   { chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',       icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  gray:    { chip: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',       icon: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  rose:    { chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',          icon: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  sky:     { chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',             icon: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  indigo:  { chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',    icon: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
  violet:  { chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',    icon: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
  fuchsia: { chip: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', icon: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300' },
}

export function KpiPill({ color, Icon, count, label, href }: {
  color: KpiColor
  Icon: ComponentType<{ className?: string }>
  count: number
  label: string
  href?: string
}) {
  const st = STYLE[color]
  const inner = (
    <>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-current/15', st.icon)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 text-left">
        <p className="text-sm font-bold leading-none tabular-nums">{count}</p>
        {/* Rótulo esconde em containers MUITO estreitos (< 220px) */}
        <p className="mt-0.5 hidden truncate text-[10px] font-medium leading-tight opacity-80 @[220px]:block">{label}</p>
      </div>
    </>
  )
  const className = cn(
    'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors',
    st.chip,
    href && 'hover:brightness-95 dark:hover:brightness-110',
  )
  return href
    ? <Link href={href} className={className}>{inner}</Link>
    : <div className={className}>{inner}</div>
}
