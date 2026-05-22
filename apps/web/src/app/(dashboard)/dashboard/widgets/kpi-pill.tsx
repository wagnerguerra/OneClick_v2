'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { cn } from '@saas/ui'

export type KpiColor = 'red' | 'orange' | 'amber' | 'gray' | 'emerald' | 'rose' | 'sky' | 'indigo' | 'violet' | 'fuchsia'

const STYLE: Record<KpiColor, string> = {
  red:      'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 [&_p]:text-red-700 dark:[&_p]:text-red-400 [&_.lab]:text-red-600/70',
  orange:   'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-600 [&_p]:text-orange-700 dark:[&_p]:text-orange-400 [&_.lab]:text-orange-600/70',
  amber:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 [&_p]:text-amber-700 dark:[&_p]:text-amber-400 [&_.lab]:text-amber-600/70',
  gray:     'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 [&_p]:text-gray-700 dark:[&_p]:text-gray-400 [&_.lab]:text-gray-600/70',
  emerald:  'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 [&_p]:text-emerald-700 dark:[&_p]:text-emerald-400 [&_.lab]:text-emerald-600/70',
  rose:     'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600 [&_p]:text-rose-700 dark:[&_p]:text-rose-400 [&_.lab]:text-rose-600/70',
  sky:      'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 [&_p]:text-sky-700 dark:[&_p]:text-sky-400 [&_.lab]:text-sky-600/70',
  indigo:   'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 [&_p]:text-indigo-700 dark:[&_p]:text-indigo-400 [&_.lab]:text-indigo-600/70',
  violet:   'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600 [&_p]:text-violet-700 dark:[&_p]:text-violet-400 [&_.lab]:text-violet-600/70',
  fuchsia:  'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-600 [&_p]:text-fuchsia-700 dark:[&_p]:text-fuchsia-400 [&_.lab]:text-fuchsia-600/70',
}

export function KpiPill({ color, Icon, count, label, href }: {
  color: KpiColor
  Icon: ComponentType<{ className?: string }>
  count: number
  label: string
  href?: string
}) {
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <div className="text-right min-w-0">
        <p className="text-base font-bold leading-none tabular-nums">{count}</p>
        {/* Label esconde em containers MUITO estreitos (< 220px) */}
        <p className="lab text-[9px] font-medium leading-tight truncate hidden @[220px]:block">{label}</p>
      </div>
    </>
  )
  const className = cn(
    'flex items-center gap-1.5 rounded-lg border px-2 py-1 hover:shadow-md transition-shadow shrink-0',
    STYLE[color],
  )
  return href ? (
    <Link href={href} className={className} title={`${count} ${label}`}>{inner}</Link>
  ) : (
    <div className={className} title={`${count} ${label}`}>{inner}</div>
  )
}
