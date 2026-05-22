'use client'

/**
 * PageHeaderIcon — ícone padronizado do header de página, com fundo na cor do
 * módulo (CSS var dinâmica, editável em /admin/design-system).
 *
 * Padrão da casa: SEMPRE usar esse componente em vez de
 *   <div className="bg-gradient-to-br from-X-500 to-X-600 ...">
 *
 * O fundo é resolvido via `var(--mod-<slug>, <fallback hex>)` — assim quando o
 * admin troca a cor do bloco no Design System, todo header reflete sem
 * precisar buildar/deploy.
 *
 * Uso:
 *   <PageHeaderIcon icon={Building2} module="cadastros" />
 *
 * Tamanho compacto (header de detalhe enxuto):
 *   <PageHeaderIcon icon={Pencil} module="comercial" size="sm" />
 */

import { cn } from '@saas/ui'
import type { LucideIcon } from 'lucide-react'

export type ModuleSlug =
  | 'cadastros'
  | 'comercial'
  | 'administrativo'
  | 'legalizacao'
  | 'trabalhista'
  | 'fiscal'
  | 'contabil'
  | 'ti'
  | 'qualidade'
  | 'configuracoes'

// Fallback hex quando a CSS var não está definida (SSR, modo recovery, etc).
// Bate com DEFAULT_MODULE_COLORS de apps/api/src/theme/theme.service.ts.
const FALLBACK_HEX: Record<ModuleSlug, string> = {
  cadastros:      '#10b981',
  comercial:      '#fb7185',
  administrativo: '#38bdf8',
  legalizacao:    '#e879f9',
  trabalhista:    '#a3e635',
  fiscal:         '#818cf8',
  contabil:       '#a78bfa',
  ti:             '#22d3ee',
  qualidade:      '#fbbf24',
  configuracoes:  '#fb923c',
}

interface Props {
  icon: LucideIcon
  module: ModuleSlug
  /** sm = h-10 w-10 (icon h-5), default = h-12 w-12 (icon h-6) */
  size?: 'sm' | 'default'
  className?: string
}

export function PageHeaderIcon({ icon: Icon, module, size = 'default', className }: Props) {
  const bg = `var(--mod-${module}, ${FALLBACK_HEX[module]})`
  const box = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'
  const iconSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[4px] text-white shadow-md',
        box,
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      <Icon className={iconSize} />
    </div>
  )
}
