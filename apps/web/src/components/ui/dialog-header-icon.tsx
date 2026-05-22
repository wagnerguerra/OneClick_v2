'use client'

/**
 * DialogHeaderIcon — header padronizado de modal com ícone à esquerda
 * ocupando a altura do título + descrição.
 *
 * Padrão da casa: TODO modal deve usar esse componente em vez do {DialogHeader}
 * cru, garantindo consistência visual em todo o sistema.
 *
 * Uso básico:
 *   <DialogHeaderIcon icon={Database} color="sky">
 *     <DialogTitle>Novo ativo</DialogTitle>
 *     <DialogDescription>Cadastro rápido — depois você pode editar...</DialogDescription>
 *   </DialogHeaderIcon>
 *
 * Variante sr-only (acessibilidade — Radix exige um DialogTitle sempre,
 *  mesmo em loaders/skeletons):
 *   <DialogHeaderIcon icon={Loader2} color="sky" srOnly>
 *     <DialogTitle>Carregando…</DialogTitle>
 *   </DialogHeaderIcon>
 *
 * Variante sticky/com className próprio (override do estilo padrão do header):
 *   <DialogHeaderIcon icon={Pencil} color="sky" className="border-b border-border/40">
 *     ...
 *   </DialogHeaderIcon>
 */

import { DialogHeader } from '@saas/ui'
import { cn } from '@saas/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type IconColor =
  | 'sky' | 'emerald' | 'rose' | 'amber' | 'violet' | 'indigo'
  | 'cyan' | 'orange' | 'fuchsia' | 'lime' | 'slate' | 'red' | 'purple' | 'blue'

const COLOR_CLASSES: Record<IconColor, string> = {
  sky:      'bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400',
  emerald:  'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  rose:     'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
  amber:    'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  violet:   'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
  indigo:   'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
  cyan:     'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
  orange:   'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
  fuchsia:  'bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400',
  lime:     'bg-lime-100 dark:bg-lime-950/40 text-lime-600 dark:text-lime-400',
  slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  red:      'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400',
  purple:   'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
  blue:     'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
}

interface Props {
  /** Ícone Lucide à esquerda (renderizado em h-6 w-6 dentro de um box h-12 w-12). */
  icon: LucideIcon
  /** Cor temática do ícone — bg do quadrado + cor do ícone. Padrão: sky. */
  color?: IconColor
  /**
   * Classes extras pro {DialogHeader} envoltório. Útil pra:
   * - Sticky em modais com body scrollável: `className="border-b border-border/40"`
   * - Modais com flex-column body: `className="px-6 pt-5 pb-3 shrink-0"`
   * - Outros overrides estruturais.
   */
  className?: string
  /**
   * Se true, esconde visualmente o header (sr-only) mantendo-o no DOM pra
   * acessibilidade. Radix Dialog EXIGE um DialogTitle — use isso em loaders,
   * skeletons ou modais cujo título não deve aparecer visualmente.
   */
  srOnly?: boolean
  /** Filhos: tipicamente <DialogTitle> + <DialogDescription>. */
  children: ReactNode
}

export function DialogHeaderIcon({ icon: Icon, color = 'sky', className, srOnly, children }: Props) {
  if (srOnly) {
    return (
      <DialogHeader className={cn('sr-only', className)}>
        {children}
      </DialogHeader>
    )
  }
  return (
    <DialogHeader className={className}>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', COLOR_CLASSES[color])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </DialogHeader>
  )
}
