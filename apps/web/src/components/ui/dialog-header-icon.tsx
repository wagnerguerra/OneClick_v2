'use client'

/**
 * DialogHeaderIcon — header padronizado de modal com ícone à esquerda,
 * centralizado verticalmente com o bloco título + descrição.
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

import { DialogHeader, DialogClose } from '@saas/ui'
import { cn } from '@saas/ui'
import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { TEXT } from '@/lib/color-styles'

type IconColor =
  | 'sky' | 'emerald' | 'rose' | 'amber' | 'violet' | 'indigo'
  | 'cyan' | 'orange' | 'fuchsia' | 'lime' | 'slate' | 'red' | 'purple' | 'blue'

// bg = superfície própria do quadrado do ícone (local); a cor do ícone deriva
// do papel TEXT da fonte única. slate mantém literal (dark -300, não casa TEXT).
const COLOR_CLASSES: Record<IconColor, string> = {
  sky:      cn('bg-sky-100 dark:bg-sky-950/40', TEXT.sky),
  emerald:  cn('bg-emerald-100 dark:bg-emerald-950/40', TEXT.emerald),
  rose:     cn('bg-rose-100 dark:bg-rose-950/40', TEXT.rose),
  amber:    cn('bg-amber-100 dark:bg-amber-950/40', TEXT.amber),
  violet:   cn('bg-violet-100 dark:bg-violet-950/40', TEXT.violet),
  indigo:   cn('bg-indigo-100 dark:bg-indigo-950/40', TEXT.indigo),
  cyan:     cn('bg-cyan-100 dark:bg-cyan-950/40', TEXT.cyan),
  orange:   cn('bg-orange-100 dark:bg-orange-950/40', TEXT.orange),
  fuchsia:  cn('bg-fuchsia-100 dark:bg-fuchsia-950/40', TEXT.fuchsia),
  lime:     cn('bg-lime-100 dark:bg-lime-950/40', TEXT.lime),
  slate:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  red:      cn('bg-red-100 dark:bg-red-950/40', TEXT.red),
  purple:   cn('bg-purple-100 dark:bg-purple-950/40', TEXT.purple),
  blue:     cn('bg-blue-100 dark:bg-blue-950/40', TEXT.blue),
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
  /**
   * URL de imagem de fundo pro header (capa). Quando setada, o header vira uma
   * faixa com a imagem em `cover` + gradiente escuro por cima pra legibilidade,
   * com ícone em vidro e textos em branco. Ex.: `/materiais/bg_calendar.jpg`.
   */
  bgImage?: string
  /** Filhos: tipicamente <DialogTitle> + <DialogDescription>. */
  children: ReactNode
}

export function DialogHeaderIcon({ icon: Icon, color = 'sky', className, srOnly, bgImage, children }: Props) {
  if (srOnly) {
    return (
      <DialogHeader className={cn('sr-only', className)}>
        {children}
      </DialogHeader>
    )
  }
  if (bgImage) {
    return (
      <DialogHeader className={cn('relative overflow-hidden border-b-0 bg-slate-900', className)}>
        {/* Imagem de fundo. Transparência (deixa o tom escuro aparecer) só no
            modo escuro; no claro a capa aparece cheia. */}
        <div
          className="absolute inset-0 opacity-100 dark:opacity-45"
          style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          aria-hidden
        />
        {/* Gradiente sutil pra reforçar o contraste dos textos à esquerda */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/25" aria-hidden />
        <div className="relative flex items-center gap-3 [&_h2]:text-white [&_p]:text-white/85">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm ring-1 ring-white/25">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            {children}
          </div>
          {/* Botão fechar próprio (maior, centralizado com o ícone). O X global
              do DialogContent deve ser ocultado via `hideClose` quando se usa bgImage. */}
          <DialogClose className="shrink-0 flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40">
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
        </div>
      </DialogHeader>
    )
  }
  return (
    <DialogHeader className={className}>
      {/* items-center: o ícone centraliza em relação ao container título+subtítulo.
          Sem subtítulo, o título centraliza sozinho com o ícone (é o container dos
          dois que está centrado, e só há um). */}
      <div className="flex items-center gap-3">
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
